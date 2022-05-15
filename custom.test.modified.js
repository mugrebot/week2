// [assignment] please copy the entire modified custom.test.js here
const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
    // [assignment] complete code here
    //lets go!!
    //we need to use the token, the pool, and the omnibridge --> set into loadfixture from waffle -- execute a scenario 1 time then remembers via blockchain snapshot -- via waffle docs
    const { token, tornadoPool, omniBridge } = await loadFixture(fixture)
    //tornadocash generates a key to act as your private key so that you can prove you are the user trying to withdraw - with this key you prove that you are who you are and can thus withdraw to any address
    const aliceKey = new Keypair()
    //the amount per the test
    const aliceAmtIn = utils.parseEther('0.1')
    //utxo stands for unspent transaction outputs, here we set up the "box" that alice can then withdraw from later

    const utxoAliceIn = new Utxo({ amount: aliceAmtIn, keypair: aliceKey })
    //prep txn set external data hash to utxoAliceIn
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [utxoAliceIn],
    })
    // now to encode the constants from above
    const bridgeEncodeData = encodeDataForBridge({
      proof: args,
      extData,
    })
    // build tx with new encoded data and previous info
    const bridgeTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      utxoAliceIn.amount,
      bridgeEncodeData,
    )
    //now for the bridge! step 1 send to bridge - step 2 send to pool
    await token.transfer(omniBridge.address, aliceAmtIn)
    const swapTx = await token.populateTransaction.transfer(tornadoPool.address, aliceAmtIn)

    await omniBridge.execute([
      { who: token.address, callData: swapTx.data },
      { who: tornadoPool.address, callData: bridgeTx.data },
    ])

    //now lets have alice withdraw
    const aliceAmtOut = utils.parseEther('0.08')
    //set recipient -- created a new wallet
    const recipient = '0xEFDe2205500A529dFB80C74F14849D501EF76Fb4'
    //create another unspent txn -- am == in - out, key
    const utxoAliceOut = new Utxo({
      amount: aliceAmtIn.sub(aliceAmtOut),
      keypair: aliceKey,
    })
    await transaction({
      tornadoPool,
      inputs: [utxoAliceIn],
      outputs: [utxoAliceOut],
      recipient: recipient,
    })
    //tests
    //first lets check that our recipient got the tokens
    const tokenRecipientBalance = await token.balanceOf(recipient)
    expect(tokenRecipientBalance).to.be.equal(aliceAmtOut)
    //Withdrawals are occuring on l2 therefore out bridge balance should be 0!
    const bridgeBalance = await token.balanceOf(omniBridge.address)
    expect(bridgeBalance).to.be.equal(0)
    //check that the leftover from in-out is still in pool
    const poolBalance = await token.balanceOf(tornadoPool.address)
    expect(poolBalance).to.be.equal(aliceAmtIn.sub(aliceAmtOut))
  })
  it('[assignment] iii. see assignment doc for details', async () => {
    // [assignment] complete code here
    //test for alice to deposit 0.13 in l1, sends bob 0.06 in l2 -- bob withdraws all funds -- alice withdraws all funds -- assert balances are correct

    const { token, tornadoPool, omniBridge } = await loadFixture(fixture)

    //need keys for alice and bob
    const aliceKey = new Keypair()
    const bobKey = new Keypair()

    //define alices amounts/amount to send to bob
    const aliceAmtInL1 = utils.parseEther('0.13')
    const aliceToBobL2 = utils.parseEther('0.06')

    //define addresses for bob and alice from https://docs.ethers.io/v4/api-wallet.html
    const alicewallet = ethers.Wallet.createRandom().address
    const bobwallet = ethers.Wallet.createRandom().address

    //utxo for deposit of 0.13 AND sending to bob on l2
    const utxoAliceIn = new Utxo({ amount: aliceAmtInL1, keypair: aliceKey })
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [utxoAliceIn],
    })

    const bridgeEncodeData = encodeDataForBridge({
      proof: args,
      extData,
    })
    // build tx with new encoded data and previous info
    const bridgeTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      utxoAliceIn.amount,
      bridgeEncodeData,
    )
    //now for the bridge! step 1 send to bridge - step 2 send to pool
    await token.transfer(omniBridge.address, aliceAmtInL1)
    const swapTx = await token.populateTransaction.transfer(tornadoPool.address, aliceAmtInL1)

    await omniBridge.execute([
      { who: token.address, callData: swapTx.data },
      { who: tornadoPool.address, callData: bridgeTx.data },
    ])

    //lets do something similar to send bob some eth on l2

    //define amounts to go out
    const aliceAmtOut = aliceAmtInL1.sub(aliceToBobL2)

    //this was tricky -- we are sending directly to bob, not a box that bob can withdraw from like previous example
    const utxoAlicetoBob = new Utxo({ amount: aliceToBobL2, keypair: Keypair.fromString(bobKey.address()) })

    const utxoAliceOut = new Utxo({ amount: aliceAmtOut, keypair: aliceKey })

    await transaction({
      tornadoPool,
      inputs: [utxoAliceIn],
      outputs: [utxoAlicetoBob, utxoAliceOut],
    })

    //first lets have bob withdraw -- per discord - we are generating something random here that isnt in the merkle tree so bobsutxo needs to be updated differently
    //const utxoBobOut = new Utxo({ amount: aliceToBobL2, keypair: bobKey })

    // bob checks the chain
    const check = tornadoPool.filters.NewCommitment()

    const fromBlock = await ethers.provider.getBlock()

    const events = await tornadoPool.queryFilter(check, fromBlock.number)
    let utxoBobOut
    // tornado cash is tricky LOL
    try {
      utxoBobOut = Utxo.decrypt(bobKey, events[0].args.encryptedOutput, events[0].args.index)
    } catch (e) {
      utxoBobOut = Utxo.decrypt(bobKey, events[1].args.encryptedOutput, events[1].args.index)
    }
    expect(utxoBobOut.amount).to.be.equal(aliceToBobL2)

    await transaction({
      tornadoPool,
      inputs: [utxoBobOut],
      outputs: [],
      recipient: bobwallet,
    })

    //alice withdraws
    await transaction({
      tornadoPool,
      inputs: [utxoAliceOut],
      outputs: [],
      recipient: alicewallet,
      isL1Withdrawal: true,
    })

    //lets test that it all works!!!
    const bob = await token.balanceOf(bobwallet)
    expect(bob).to.be.equal(utils.parseEther('0.06'))
    //alice withdraws on L1 aka her wallet balance should be 0 and the bridge balance should have the leftover funds
    const alice = await token.balanceOf(alicewallet)
    expect(alice).to.be.equal(0)
    //said before but since its an l1 withdrawal, the balance here should be 0.13-0.06 = 0.07
    const bridgeBalance = await token.balanceOf(omniBridge.address)
    expect(bridgeBalance).to.be.equal(utils.parseEther('0.07'))
    //everything should be withdrawn so this should return 0
    const poolBalance = await token.balanceOf(tornadoPool.address)
    expect(poolBalance).to.be.equal(0)
  })
})
