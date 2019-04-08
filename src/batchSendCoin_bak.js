//@flow
const { Client } = require('pg')
var Web3 = require('web3');
var web3 = new Web3(new Web3.providers.WebsocketProvider("ws://127.0.0.1:7545"));
const tokenABI = require('../config/tokenABI');
const airdropABI = require('../config/airdropABI');
const logger = require('./logger')
const airdropAddress='0x4e9738c255146b574dd51c3dad849628c82f3829' //空投合约地址
const controllerAddress='0x06ffDB8eF81478B1E8E04C5097fab868559Bc4e2' //通过合约创建者调用空投的setController， 最好另外生成一个新的地址
const tokenAddress='0x2ff740a0c797cfcc89d0a844baadaa9ab8323c83'  //BO代币地址
const conString = "tcp://postgres:etz.123456@localhost/blocktest"
const privateKey = '' //controller的私钥
const table_name = 'air_drop_20180621';
var airdropContract = new web3.eth.Contract(airdropABI, airdropAddress);
const batchSize = 100 //一次合约调用发送的数量, 例如现在是一次给一百个人发
const sendValue = 10 //发送的金额
var valuesArr = new Array(batchSize)
valuesArr.fill(sendValue)

// 合约地址里面要有bo，调用的时候实际是花的合约里面的代币， controller里面要有足够的以太零，用作维持交易频率

class BatchSendCoin {


  constructor (){
    this.maxSendAmount = 5 //合约调用的队列大小， 最多存在5笔处于pendding的调用
    this.currentPendingAmount = 0
    this.intervalId = 0
    this.arr = []
    this.total = 0
    this.finished = 0
    this.sended = 0
    this.finishState = false
  }

  async sendcoin() {
    if (this.currentPendingAmount < this.maxSendAmount) {
      if (this.sended < this.total) {
        try {
          // console.log(11111);
          var willFinishIndex = ((this.sended + batchSize) >this.total)? this.total: this.sended+batchSize
          var sendingAddrArray = this.arr.slice(this.sended, willFinishIndex).map(function(row){ return row.address})
          var sendingAddrArrayStr = sendingAddrArray.map(function(address){ return '\'' + address + '\'' })
          this.sended=willFinishIndex
          // var address = row.address
          // var address="0xC9E976193E35B03712ce7E647F73CB2628b6aFe3";
          // var id = row.id
          var updatePendingSql="update "+table_name+" set state='1', updateAt='now()'  where address IN ("+sendingAddrArrayStr+ ')';
          // console.log(updatePendingSql);
          await this.client.query(updatePendingSql)
          var data =airdropContract.methods['multiSend(address,address[],uint256[])'](tokenAddress, sendingAddrArray, valuesArr).encodeABI();
          var txObject = await web3.eth.accounts.signTransaction({
            to: airdropAddress,
            data: data,
            gas: 4000000, //100个地址的话差不多时两百万左右，具体可以测试的时候看下交易的gas used做调整
            nonce: this.nonce++,
          },privateKey)
          web3.eth.sendSignedTransaction(txObject.rawTransaction).once('confirmation', (confNumber, receipt) => {
            logger.info('transaction comfirm: '+JSON.stringify(receipt), 'transaction state')
            var updateSuccessSql="update "+table_name+" set state='2', updateAt='now()' ,txHash='" + receipt.transactionHash + "' where address IN ("+sendingAddrArrayStr + ")";
            this.client.query(updateSuccessSql).then(
              result => {
                // console.log('txHash store sucess: ', receipt.transactionHash);
                logger.info('txHash store sucess: '+ receipt.transactionHash, 'datebaseUpdate');
              }
            ).catch(e => {
              // console.log('txHash store error: ', receipt.transactionHash);
              logger.error('txHash store error: '+ receipt.transactionHash, 'datebaseUpdate');
            })
            this.currentPendingAmount--
            this.finished++
            // console.log('confirmed: ',this.finished);
            logger.info('finished: '+this.finished);
          })
          .once('error',(error) => {
            // console.log('eeerrrror: ',error);
            logger.error('transactionError: '+error, 'transaction state');
            var updateRevertSql="update "+table_name+" set state='3', updateAt='now()' where address IN ("+sendingAddrArrayStr+ ")";
            this.client.query(updateRevertSql).catch(e => {
              // console.log(e);
              logger.error(e);
              logger.error('txHash store error: '+ receipt.transactionHash, 'datebaseUpdate');
            })
            this.currentPendingAmount--
            this.finished++
          })
          // console.log('sended coin: ', this.sended);
          logger.info('sended coin: '+ this.sended)
          this.currentPendingAmount++
          this.sended ++
        } catch (e) {
          // console.log(e);
          logger.info(e);
        }
      } else {
        if (!this.finishState) {
          this.finishState = true
          // console.log('send coin finish at %s', new Date());

          logger.info('send coin finish at '+ new Date());
        }
        if (this.finished == Math.ceil(this.total/batchSize)) {
          // console.log('send coin task end at %s', new Date());
          logger.info('send coin task end at '+ new Date());
          clearInterval(this.intervalId)
        }
      }
    }
  }

  async start() {
    this.client = new Client(conString)
    await this.client.connect()
    var res = await  this.client.query('SELECT * FROM air_drop_20180621 WHERE state=0')
    this.arr = res.rows
    this.total = this.arr.length
    logger.info('total address to send: ' + this.total);
    this.nonce = await web3.eth.getTransactionCount(controllerAddress)
    var startBlock = await web3.eth.getBlockNumber()
    var startBalance = await airdropContract.methods.balanceIn(tokenAddress).call()
    logger.info('start at balance: '+ startBalance);
    this.intervalId = setInterval(this.sendcoin.bind(this), 1000)
    // setInterval(function(){
    //   console.log("每十秒循环一次");
    //   let count=0;
    //   let timeset = setInterval(function(){
    //     count++;
    //     console.log("count=====",count);
    //     if(count==10){
    //       console.log("结束每秒");
    //       clearInterval(timeset);
    //     }
    //
    //   },1000);
    // },10000);

  }
}

var o = new BatchSendCoin()
o.start()
