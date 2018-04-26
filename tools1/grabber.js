require( '../db.js' );
var etherUnits = require("../lib/etherUnits.js");
var BigNumber = require('bignumber.js');

var fs = require('fs');

var Chain3 = require('chain3');

var mongoose = require( 'mongoose' );
var Block     = mongoose.model( 'Block' );
var Transaction     = mongoose.model( 'Transaction' );

var grabBlocks = function(config) {
    var chain3 = new Chain3(new Chain3.providers.HttpProvider('http://' + config.gethHost.toString() + ':' +
        config.gethPort.toString()));


    if('listenOnly' in config && config.listenOnly === true)
        listenBlocks(config, chain3);
    else
        setTimeout(function() {
            grabBlock(config, chain3, config.blocks.pop());
        }, 2000);

}

var listenBlocks = function(config, chain3) {
    var newBlocks = chain3.mc.filter("latest");
    newBlocks.watch(function (error, log) {

        if(error) {
            console.log('Error: ' + error);
            process.exit(9);
        } else if (log == null) {
            console.log('Warning: null block hash');
        } else {
            grabBlock(config, chain3, log);
        }

    });
}

var grabBlock = function(config, chain3, blockHashOrNumber) {
    var desiredBlockHashOrNumber;

    // check if done
    if(blockHashOrNumber == undefined) {
        return;
    }

    if (typeof blockHashOrNumber === 'object') {
        if('start' in blockHashOrNumber && 'end' in blockHashOrNumber) {
            desiredBlockHashOrNumber = blockHashOrNumber.end;
        }
        else {
            console.log('Error: Aborted becasue found a interval in blocks ' +
                'array that doesn\'t have both a start and end.');
            process.exit(9);
        }
    }
    else {
        desiredBlockHashOrNumber = blockHashOrNumber;
    }

    if(chain3.isConnected()) {

        chain3.mc.getBlock(desiredBlockHashOrNumber, true, function(error, blockData) {
            if(error) {
                console.log('Warning: error on getting block with hash/number: ' +
                    desiredBlockHashOrNumber + ': ' + error);
            }
            else if(blockData == null) {
                console.log('Warning: null block data received from the block with hash/number: ' +
                    desiredBlockHashOrNumber);
            }
            else {
                if('terminateAtExistingDB' in config && config.terminateAtExistingDB === true) {
                    checkBlockDBExistsThenWrite(config, blockData);
                }
                else {
                    writeBlockToDB(config, blockData);
                }
                if (!('skipTransactions' in config && config.skipTransactions === true))
                    writeTransactionsToDB(config, blockData);
                if('listenOnly' in config && config.listenOnly === true)
                    return;

                if('hash' in blockData && 'number' in blockData) {
                    // If currently working on an interval (typeof blockHashOrNumber === 'object') and
                    // the block number or block hash just grabbed isn't equal to the start yet:
                    // then grab the parent block number (<this block's number> - 1). Otherwise done
                    // with this interval object (or not currently working on an interval)
                    // -> so move onto the next thing in the blocks array.
                    if(typeof blockHashOrNumber === 'object' &&
                        (
                            (typeof blockHashOrNumber['start'] === 'string' && blockData['hash'] !== blockHashOrNumber['start']) ||
                            (typeof blockHashOrNumber['start'] === 'number' && blockData['number'] > blockHashOrNumber['start'])
                        )
                    ) {
                        blockHashOrNumber['end'] = blockData['number'] - 1;
                        grabBlock(config, chain3, blockHashOrNumber);
                    }
                    else {
                        grabBlock(config, chain3, config.blocks.pop());
                    }
                }
                else {
                    console.log('Error: No hash or number was found for block: ' + blockHashOrNumber);
                    process.exit(9);
                }
            }
        });
    }
    else {
        console.log('Error: Aborted due to chain3 is not connected when trying to ' +
            'get block ' + desiredBlockHashOrNumber);
        process.exit(9);
    }
}


var writeBlockToDB = function(config, blockData) {
    return new Block(blockData).save( function( err, block, count ){
        if ( typeof err !== 'undefined' && err ) {
            if (err.code == 11000) {
                console.log('Skip: Duplicate key ' +
                blockData.number.toString() + ': ' +
                err);
            } else {
               console.log('Error: Aborted due to error on ' +
                    'block number ' + blockData.number.toString() + ': ' +
                    err);
               process.exit(9);
           }
        } else {
            if(!('quiet' in config && config.quiet === true)) {
                console.log('DB successfully written for block number ' +
                    blockData.number.toString() );
            }
        }
      });
}

/**
  * Checks if the a record exists for the block number then ->
  *     if record exists: abort
  *     if record DNE: write a file for the block
  */
var checkBlockDBExistsThenWrite = function(config, blockData) {
    Block.find({number: blockData.number}, function (err, b) {
        if (!b.length)
            writeBlockToDB(config, blockData);
        else {
            console.log('Aborting because block number: ' + blockData.number.toString() +
                ' already exists in DB.');
           
        }

    })
}

/**
    Break transactions out of blocks and write to DB
**/

var writeTransactionsToDB = function(config, blockData) {
    var bulkOps = [];
    if (blockData.transactions.length > 0) {
        for (d in blockData.transactions) {
            var txData = blockData.transactions[d];
            txData.timestamp = blockData.timestamp;
            txData.value = etherUnits.toEther(new BigNumber(txData.value), 'wei');
            bulkOps.push(txData);
        }
        Transaction.collection.insert(bulkOps, function( err, tx ){
            if ( typeof err !== 'undefined' && err ) {
                if (err.code == 11000) {
                    console.log('Skip: Duplicate key ' +
                    err);
                } else {
                   console.log('Error: Aborted due to error: ' +
                        err);
                   process.exit(9);
               }
            } else if(!('quiet' in config && config.quiet === true)) {
                console.log('DB successfully written for block ' +
                    blockData.transactions.length.toString() );

            }
        });
    }
}

/*
  Patch Missing Blocks
*/
var patchBlocks = function(config) {
    var chain3 = new Chain3(new Chain3.providers.HttpProvider('http://' + config.gethHost.toString() + ':' +
        config.gethPort.toString()));

    // number of blocks should equal difference in block numbers
    var firstBlock = 0;
    var lastBlock = chain3.mc.blockNumber;
    blockIter(chain3, firstBlock, lastBlock, config);
}

var blockIter = function(chain3, firstBlock, lastBlock, config) {
    // if consecutive, deal with it
    if (lastBlock < firstBlock)
        return;
    if (lastBlock - firstBlock === 1) {
        [lastBlock, firstBlock].forEach(function(blockNumber) {
            Block.find({number: blockNumber}, function (err, b) {
                if (!b.length)
                    grabBlock(config, chain3, firstBlock);
            });
        });
    } else if (lastBlock === firstBlock) {
        Block.find({number: firstBlock}, function (err, b) {
            if (!b.length)
                grabBlock(config, chain3, firstBlock);
        });
    } else {

        Block.count({number: {$gte: firstBlock, $lte: lastBlock}}, function(err, c) {
          var expectedBlocks = lastBlock - firstBlock + 1;
          if (c === 0) {
            grabBlock(config, chain3, {'start': firstBlock, 'end': lastBlock});
          } else if (expectedBlocks > c) {
            console.log("Missing: " + JSON.stringify(expectedBlocks - c));
            var midBlock = firstBlock + parseInt((lastBlock - firstBlock)/2);
            blockIter(chain3, firstBlock, midBlock, config);
            blockIter(chain3, midBlock + 1, lastBlock, config);
          } else
            return;
        })
    }
}


/** On Startup **/
// geth --rpc --rpcaddr "localhost" --rpcport "8545"  --rpcapi "eth,net,chain3"

var config = require('./config');
grabBlocks(config);
// patchBlocks(config);
