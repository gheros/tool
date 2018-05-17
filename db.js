mongoose = require( 'mongoose' );
var Schema   = mongoose.Schema;

var Block = new Schema(
{
    "number": {type: Number, index: {unique: true}},
    "hash": String,
    "parentHash": String,
    "nonce": String,
    "sha3Uncles": String,
    "logsBloom": String,
    "transactionsRoot": String,
    "stateRoot": String,
    "receiptRoot": String,
    "miner": String,
    "difficulty": String,
    "totalDifficulty": String,
    "size": Number,
    "extraData": String,
    "gasLimit": Number,
    "gasUsed": Number,
    "timestamp": Number,
    "uncles": [String]
});

var Contract = new Schema(
		{
		    "address": {type: String, index: {unique: true}},
		    "ERC":Number,//0:normal contract 2:ERC20, 3:ERC223
		    "creationTransaction": String,
		    "contractName": String,
		    "tokenName": String,
		    "symbol": String,
		    "owner": String,
		    "decimals": Number,
		    "totalSupply": Number,
		    "balance": Number,
		    "compilerVersion": String,
		    "optimization": Boolean,
		    "sourceCode": String,
		    "abi": String,
		    "byteCode": String
		}, {collection: "Contract"});

var Transaction = new Schema(
		{
		    "hash": {type: String, index: {unique: true}},
		    "nonce": Number,
		    "blockHash": String,
		    "blockNumber": Number,
		    "transactionIndex": Number,
		    "from": String,
		    "to": String,
		    "value": String,
		    "gas": Number,
		    "contractAddress":String,
		    "gasUsed":Number,
		    "gasPrice": String,
		    "timestamp": Number,
		    "input": String
		});
//代币交易表
var TokenTransfer = new Schema(
    {
        "transactionHash": String,
        "blockNumber": Number,
        "amount": Number,
        "contractAdd": String,
        "to": String,
        "from": String,
        "timestamp": Number
    });

var Token = new Schema(
		{
		    "fullName": {type: String, index: {unique: true}},
		    "nickName": String,
		    "price": String,
		    "change": Number,
		    "volume": Number,
		    "marketcap": String,
		    "totalSupply": String,
		    "contractAddress": String,
		    "decimals": Number,
		    "createTime":Date,
		    "type": Number
});

var Holder = new Schema(
		{
			"address": String,
			"quantity": String,
			"contractAddress": Number,
			"percentage":String
		});

mongoose.model('Block', Block);
mongoose.model('Contract', Contract);
mongoose.model('Transaction', Transaction);
mongoose.model('TokenTransfer', TokenTransfer);
mongoose.model('Token', Token);
mongoose.model('Holder', Holder);
module.exports.Block = mongoose.model('Block');
module.exports.Contract = mongoose.model('Contract');
module.exports.Transaction = mongoose.model('Transaction');
module.exports.TokenTransfer = mongoose.model('TokenTransfer');
module.exports.Token = mongoose.model('Token');
module.exports.Holder = mongoose.model('Holder');

var config = require('./tools/config');
console.log(process.env.MONGO_URI || 'mongodb://'+ config.mongouname.toString()+':'+config.mongopasswd.toString()+'@' + config.mongoHost.toString() + '/'+config.dbname.toString());
mongoose.connect(process.env.MONGO_URI || 'mongodb://'+config.mongouname.toString()+':'+config.mongopasswd.toString()+'@' + config.mongoHost.toString() + '/'+config.dbname.toString());
mongoose.set('debug', true);
