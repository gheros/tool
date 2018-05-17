require( '../db.js' );
var etherUnits = require("../lib/etherUnits.js");
var BigNumber = require('bignumber.js');
var fs = require('fs');
var Chain3 = require('chain3');
var mongoose = require( 'mongoose' );
var Block = mongoose.model( 'Block' );
var Transaction = mongoose.model( 'Transaction' );
var Token = mongoose.model( 'Token' );
var Contract = mongoose.model( 'Contract' );
var TokenTransfer = mongoose.model( 'TokenTransfer' );
var Holder = mongoose.model( 'Holder' );
var inspect = require('util').inspect;
// var mc = require('./web3relay').mc;
const ABI = [{"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"}];
var chain3 = new Chain3(new Chain3.providers.HttpProvider("http://192.168.58.128:8545"));
var mc = chain3.mc;
const ContractStruct = mc.contract(ABI);

//var checkTokenTx = function(contractAddress) {
//
//	var Token = ContractStruct.at(contractAddress);
////	if (!("action" in req.body)) {
////		res.status(400).send();
////	} else {
//		try {
//			var actualBalance = mc.getBalance(contractAddress);
//			actualBalance = etherUnits.toEther(actualBalance, 'wei');
//			var totalSupply = Token.totalSupply();
//			var decimals = Token.decimals();
//			var name = Token.name();
//			var symbol = Token.symbol();
//			var count = mc.getTransactionCount(contractAddress);
//			var tokenData = {
//				"balance" : actualBalance,
//				"totalSupply" : totalSupply,
//				"count" : count,
//				"decimals": decimals,
//				"name" : name,
//				"symbol" : symbol,
//				"bytecode" : mc.getCode(contractAddress)
//			}
//			return tokenData;
//		} catch (e) {
//			return null;
//			console.error(e);
//		}
//	//}
//};
	
	

var grabBlocks = function(config) {
    var chain3 = new Chain3(new Chain3.providers.HttpProvider('http://' + config.gethHost.toString() + ':' +
        config.gethPort.toString()));
    if('listenOnly' in config && config.listenOnly === true) {
    	listenBlocks(config, chain3);
    } else {
    	setTimeout(function() {
            grabBlock(config, chain3, config.blocks.pop());
        }, 2000);
    }
}

var listenBlocks = function(config, chain3) {
    var newBlocks = chain3.mc.filter("latest");
    newBlocks.watch(function (error, log) {

        if(error) {
            console.log('Error: ' + error);
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
//    else {
//        console.log('Error: Aborted due to chain3 is not connected when trying to ' +
//            'get block ' + desiredBlockHashOrNumber);
//        process.exit(9);
//    }
}


var writeBlockToDB = function(config, blockData) {
    return new Block(blockData).save( function( err, block, count ){
        if ( typeof err !== 'undefined' && err ) {
            if (err.code == 11000) {
//                console.log('Skip: Duplicate key ' +
//                blockData.number.toString() + ': ' +
//                err);
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
 * 交易存入db(所有交易存入transactions, 过滤发币交易将erc代币信息存入tokens)
 */
var writeTransactionsToDB = function(config, blockData) {
    var bulkOps = [];
    var tokenInfo = {};
    if (blockData.transactions.length > 0) {
        for (d in blockData.transactions) {
            var txData = blockData.transactions[d];
            txData.timestamp = blockData.timestamp;
            txData.gasPrice = etherUnits.toEther(new BigNumber(txData.gasPrice), 'ether');
            txData.value = etherUnits.toEther(new BigNumber(txData.value), 'wei');
            //receipt
            var currentTxRec = chain3.mc.getTransactionReceipt(txData.hash);
            if(currentTxRec){
                txData.gasUsed = currentTxRec.gasUsed;
                txData.contractAddress = currentTxRec.contractAddress;
            }
            
            bulkOps.push(txData);
            // 判断发币交易
            if(txData.input && txData.input.length > 20){
            	console.log("------------contractAddress: " + currentTxRec.contractAddress);
	            if (txData.to == null) {
	            	// 发币交易tx
	            	if (currentTxRec.contractAddress != null && currentTxRec.contractAddress != '') {
	            		var tokenData = ContractStruct.at(currentTxRec.contractAddress);
	            		console.log("发币交易+=====" + tokenData.symbol());
	                	if (tokenData) {
//	                		tokenInfo.fullName = tokenData.name;  // 全名
//	                		tokenInfo.nickName = tokenData.symbol;  // 简称
//	                		tokenInfo.totalSupply = tokenData.totalSupply;  // 发行总量
//	                		tokenInfo.decimals = tokenData.decimals; // 精度
//	                		tokenInfo.contractAddress = currentTxRec.contractAddress; // 合约地址
//	                		tokenInfo.price = '';  // 代币价格
//	                		tokenInfo.change = '';  // 涨跌幅
//	                		tokenInfo.volume = '';   // 24h交易量
//	                		tokenInfo.marketcap = '';   // 总市值
//	                		tokenInfo.createTime = new Date(); // 创建时间
	                		var contractdb = {}
	                        contractdb.byteCode = mc.getCode(currentTxRec.contractAddress);
	                        contractdb.ERC = 1;
	                        contractdb.tokenName = tokenData.name();
	                        contractdb.decimals = tokenData.decimals();
	                        contractdb.symbol = tokenData.symbol();
	                        contractdb.totalSupply = tokenData.totalSupply();
	                        contractdb.owner = txData.from;
	                        contractdb.creationTransaction = txData.hash;
	                        
	                        Contract.update(
	                                {address: currentTxRec.contractAddress}, 
	                                {$setOnInsert: contractdb}, 
	                                {upsert: true}, 
	                                function (err, data) {
	                                console.log(data);
	                                }
	                            );
	                        // 监听
//	                        var transferEvent = TokenTransferGrabber.GetTransferEvent(ABI, currentTxRec.contractAddress)
//	                        TokenTransferGrabber.ListenTransferTokens(transferEvent);
	                		// 存入tokens
//	                		Token.collection.insertOne(tokenInfo, function(err, tx) {
//	                            if ( typeof err !== 'undefined' && err ) {
//	                                if (err.code == 11000) {
//	                                    console.log('Skip: Duplicate key ' +
//	                                    err);
//	                                } else {
//	                                   console.log('Error: Aborted due to error: ' +
//	                                        err);
//	                                   process.exit(9);
//	                               }
//	                            } else if (!('quiet' in config && config.quiet === true)) {
//	                                console.log('DB successfully written for block ' +
//	                                    blockData.transactions.length.toString() );
//	
//	                            }
//	                        });
	                	}
	            	}
	            	
	            } else {
	            	// 代币交易tx
	            	console.log("------------input: " + txData.input);
	            	console.log("------------to: " + txData.to);
	            	
	            	// 解析获取代币数量amount
	            	var inputValue = txData.input;
	            	var value = inputValue.substring(74);
					var point = 0;
					var amount = 0;
					do {
						point++;
					} while(point<64 && value.charAt(point)=='0');
					if (point == 64) {
						
					} else {
						amount = value.substring(point);
					}
					
					// 解析toAddress
	            	var toAddress;
	            	if ("0xa9059cbb" == inputValue.substring(0, 10)) {
	        			//代币转发，解析to
	            		toAddress = "0x" + inputValue.substring(34, 74);
	        		}
					
	            	var tokenTransferObj = {"transactionHash": "", "blockNumber": 0, "amount": 0, "contractAdd":"", "from": "", "to": "","timestamp":0};
	                tokenTransferObj.transactionHash= txData.hash;
	                tokenTransferObj.blockNumber= txData.blockNumber;
	                tokenTransferObj.amount= parseInt(amount);
	                tokenTransferObj.contractAdd= txData.to;
	                tokenTransferObj.to= toAddress;
	                tokenTransferObj.from= txData.from;
	                tokenTransferObj.timestamp = txData.timestamp;
	                new TokenTransfer(tokenTransferObj).save( function( err, token, count ){
	                  if(err){
	                    console.error(err);
	                  }else{
	                    console.log('DB successfully written for tx ' + tokenTransferObj.transactionHash ); 
	                  }
	                })
	                
	                // 解析tokenHolders(1. 解析to, new的添加，计算balance,percentage。from和 to old的计算balance,
	                // 如果当前交易后为0,执行delete)
	                var fromAddress = txData.from;
	                var quantity = parseInt(amount)
	    			//用户地址
	                var fromdata = "0x70a08231" + "000000000000000000000000" + fromAddress.substring(2);
	                // from 判断balance,为0的执行delete
	                var fromAddressBalance = chain3.mc.call({
	                	to: txData.to,  // 合约地址
	                	data: fromdata
	                }, 'latest');
	                // balanceResult转换成值
	                if (fromAddressBalance == 0) {
	                	// 账户余额为0，删除
	                	Holder.remove({"address": fromAddress, "contractAddress": txData.to}, function(err){
	                		if (err) {
	                			console.log(err);
	                		} else {
	                			console.log("余额为0的删除成功！");
	                		}
	                	});
	                }
	                
	                // to判断，new执行新增，old计算balance
	                Holder.find({address: toAddress, contractAddress: contractAddress}, function (err, result) {
	                	if (result == null) {
	                		// 新增
	                		var percentage = quantity;
	                		Holder.insert({"address": toAddress, "quantity": quantity,
	                			"contractAddress":contractAddress},function(err){
	                			if (err) {
    	                			console.log(err);
    	                		} else {
    	                			console.log("新增成功！");
    	                		}
	                		});
	                		
	                		
	                	} else {
	                		var todata = "0x70a08231" + "000000000000000000000000" + toAddress.substring(2);
	                		// 判断balance,为0的执行delete
	                		var toBalance = chain3.mc.call({
	    	                	to: txData.to,  // 合约地址
	    	                	data: todata
	    	                }, 'latest');
	    	                // balanceResult转换成值
	    	                if (toBalance == 0) {
	    	                	// 账户余额为0，删除
	    	                	Holder.remove({"address": fromAddress, "contractAddress": txData.to}, function(err){
	    	                		if (err) {
	    	                			console.log(err);
	    	                		} else {
	    	                			console.log("余额为0的删除成功！");
	    	                		}
	    	                	});
	    	                }
	                	}
	                	
	                });
	            	
	            }
            }
        }
//        Transaction.collection.insert(bulkOps, function( err, tx ){
//            if ( typeof err !== 'undefined' && err ) {
//                if (err.code == 11000) {
//                    console.log('Skip: Duplicate key ' +
//                    err);
//                } else {
//                   console.log('Error: Aborted due to error: ' +
//                        err);
//                   process.exit(9);
//               }
//            } else if(!('quiet' in config && config.quiet === true)) {
//                console.log('DB successfully written for block ' +
//                    blockData.transactions.length.toString() );
//
//            }
//        });
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
