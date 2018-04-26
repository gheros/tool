/*
  Tool for calculating block stats
*/

var Chain3 = require('chain3');

var mongoose = require( 'mongoose' );
var BlockStat = require( '../db-stats.js' ).BlockStat;

var config = require('./config');

var updateStats = function() {
    var chain3 = new Chain3(new Chain3.providers.HttpProvider('http://' + config.gethHost.toString() + ':' + config.gethPort.toString()));

    mongoose.connect(process.env.MONGO_URI || 'mongodb://'+config.mongouname.toString()+':'+config.mongopasswd.toString()+'@'+ config.mongoHost.toString() + '/'+config.dbname.toString());
    mongoose.set('debug', true);

    var latestBlock = chain3.mc.blockNumber;
    getStats(chain3, latestBlock, null, latestBlock - 1000);
}


var getStats = function(chain3, blockNumber, nextBlock, endBlock) {
    if (blockNumber <= endBlock)
        process.exit(9);

    if(chain3.isConnected()) {

        chain3.mc.getBlock(blockNumber, true, function(error, blockData) {
            if(error) {
                console.log('Warning: error on getting block with hash/number: ' +
                    blockNumber + ': ' + error);
            }
            else if(blockData == null) {
                console.log('Warning: null block data received from the block with hash/number: ' +
                    blockNumber);
            }
            else {
                if (nextBlock)
                    checkBlockDBExistsThenWrite(chain3, blockData, nextBlock.timestamp);
                else
                    checkBlockDBExistsThenWrite(chain3, blockData, parseInt(Date.now()/1000));
            }
        });
    } else {
        console.log('Error: Aborted due to chain3 is not connected when trying to ' +
            'get block ' + blockNumber);
        process.exit(9);
    }
}

/**
  * Checks if the a record exists for the block number
  *     if record exists: abort
  *     if record DNE: write a file for the block
  */
var checkBlockDBExistsThenWrite = function(chain3, blockData, nextTime) {
    BlockStat.find({number: blockData.number}, function (err, b) {
        if (!b.length) {
            // calc hashrate, txCount, blocktime, uncleCount
            var stat = {
                "number": blockData.number,
                "timestamp": blockData.timestamp,
                "difficulty": blockData.difficulty,
                "txCount": blockData.transactions.length,
                "gasUsed": blockData.gasUsed,
                "gasLimit": blockData.gasLimit,
                "miner": blockData.miner,
                "blockTime": nextTime - blockData.timestamp,
                "uncleCount": blockData.uncles.length
            }
            new BlockStat(stat).save( function( err, s, count ){
                console.log(s)
                if ( typeof err !== 'undefined' && err ) {
                   console.log('Error: Aborted due to error on ' +
                        'block number ' + blockData.number.toString() + ': ' +
                        err);
                   process.exit(9);
                } else {
                    console.log('DB successfully written for block number ' +
                        blockData.number.toString() );
                    getStats(chain3, blockData.number - 1, blockData);
                }
            });
        } else {
            console.log('Aborting because block number: ' + blockData.number.toString() +
                ' already exists in DB.');
            return;
        }

    })
}

/** On Startup **/
// geth --rpc --rpcaddr "localhost" --rpcport "8545"  --rpcapi "eth,net,chain3"

var minutes = 1;
statInterval = minutes * 60 * 1000;

// setInterval(function() {
  updateStats();
// }, statInterval);
