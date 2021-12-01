const ethers = require("ethers");
const EthereumTx = require('ethereumjs-tx').Transaction;
let Common = require('ethereumjs-common').default;
const BSC_MAIN = Common.forCustomChain(
    'mainnet', {
    name: 'bnb',
    networkId: 56,
    chainId: 56
},
    'petersburg'
)

let getGasPrice = require("./gas.js").getGasPrice;

const routerAbi = new ethers.utils.Interface(require("./router.json"));
const factoryAbi = new ethers.utils.Interface(require("./factory.json"));
const WS_ENDPOINT = "qqqqqqq";
const W_ENDPOINT = "https://bsc-dataseed.binance.org/";
const PRIVATE_KEY = "qqqqq"

var provider, wallet, router, grasshopper, making;
const tokens = {
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    GASLIMIT: process.env.GASLIMIT || "1000000",
    GASPRICE: process.env.GASPRICE || "5",
};
const WEI = 10 ** 18;
const GWEI = 10 ** 9;
const EXPECTED_PONG_BACK = 30000;
const KEEP_ALIVE_CHECK_INTERVAL = 15000;
let nonce;
let chainId;
const startConnection = function () {
    provider = new ethers.providers.WebSocketProvider(WS_ENDPOINT);
    // wprovider = new ethers.providers.JsonRpcProvider(W_ENDPOINT);
    wallet = new ethers.Wallet(PRIVATE_KEY);
    account = wallet.connect(provider);
    router = new ethers.Contract(tokens.router, routerAbi, account);
    factory = new ethers.Contract(tokens.factory, factoryAbi, account);
    grasshopper = 0;

    provider._websocket.on("open", async () => {
        console.log(`Sniping has started. Watching the txpool for events...`);
        // tokens.router = ethers.utils.getAddress(tokens.router);
        var gas = await getGasPrice();
        chainId = await account.getChainId()
        keepAliveInterval = setInterval(() => {
            provider._websocket.ping();
            pingTimeout = setTimeout(() => {
                provider._websocket.terminate();
            }, EXPECTED_PONG_BACK);
        }, KEEP_ALIVE_CHECK_INTERVAL);

        provider.on("pending", async (txHash) => {
            provider.getTransaction(txHash).then(async (tx) => {
                if (grasshopper === 0) {
                    console.log("Still watching... Please wait.");
                    grasshopper = 1;
                }
                if (tx && tx.to && !making) {
                    if (tx.to === tokens.router && tx.gasPrice.lte(ethers.utils.parseUnits(`8`, 'gwei'))
                        && tx.gasPrice.gte(ethers.utils.parseUnits(`${gas.safeLow}`, 'gwei'))) {
                        var victimTxnHash, openTxnHash, closeTxnHash;
                        try {
                            const decodedInput = routerAbi.parseTransaction({ data: tx.data, value: tx.value, });
                            if (decodedInput.name != "swapETHForExactTokens" && decodedInput.name != "swapExactETHForTokens") {
                                return;
                            }
                            if (tx.value.lt(ethers.utils.parseEther('1'))) {
                                console.log("Skipped: amount of ether is too small for profitability");
                                return;
                            }
                            console.log("order transcat", ethers.utils.formatUnits(tx.value));
                            let deadline = decodedInput.args.deadline.toNumber();
                            if (deadline < Math.ceil(Date.now() / 1000)) {
                                console.log("Skipped: passed deadline");
                                return;
                            }
                            if (tx.blockHash != null) {
                                console.log("Skipped: transaction is no longer pending");
                                return;
                            }
                            let path = decodedInput.args.path;
                            console.log(`POSSIBLE TXN SPOTTED: ${tx.hash}`);
                            making = true;
                            provider.off("pending");

                            victimTxnHash = tx["hash"];

                            let gasPrice = tx.gasPrice;
                            let gasLimit = tx.gasLimit;

                            let tokenAmount = await router.getAmountsOut(ethers.utils.parseEther("0.01"), path);

                            let block = await provider.getBlock("latest")
                            deadline = block.timestamp + 300; // transaction expires in 300 seconds (5 minutes)




                            let newGasPrice = gasPrice.mul('11').div('10');
                            console.log("gas comp", tx.gasLimit.toString(), gasPrice.toString(), newGasPrice.toString())
                            nonce = await account.getTransactionCount() + 1;
                            console.log(nonce,tokenAmount)

                            // let swap = router.functions.swapExactETHForTokens(
                            //     tokenAmount[1].mul('995').div('1000'),
                            //     path,
                            //     wallet.address,
                            //     deadline
                            // );
                            let _mount=tokenAmount[tokenAmount.length-1].mul('995').div('1000')
                            let result = await router.functions.swapETHForExactTokens(
                                ethers.utils.hexlify(_mount),
                                path,
                                wallet.address,
                                ethers.utils.hexlify(deadline),
                                {
                                    gasLimit: ethers.BigNumber.from(gasLimit).toHexString(),
                                    gasPrice: ethers.BigNumber.from(newGasPrice).toHexString(),
                                    value: ethers.utils.parseEther("0.01").toHexString()
                                });

                            console.log("open txhash", result.hash,_mount.toString())
                            //receipt = await result.wait();
                            // console.log("open receipt", receipt)
                            let _path = JSON.parse(JSON.stringify(path))
                            _path.reverse()
                            newGasPrice = gasPrice.mul('9').div('10');
                            result = await router.functions.swapExactTokensForETH(
                                ethers.utils.hexlify(_mount),
                                ethers.utils.parseEther("0.01").toHexString(),
                                _path,
                                wallet.address,
                                ethers.utils.hexlify(deadline),
                                {
                                    gasLimit: ethers.BigNumber.from(gasLimit).toHexString(),
                                    gasPrice: ethers.BigNumber.from(newGasPrice).toHexString()
                                });

                            console.log("close txhash", result.hash)
                            //receipt = await result.wait();
                            // console.log("receipt", receipt)
                            // let open_encodedABI = routerAbi.encodeFunctionData("swapETHForExactTokens", [
                            //     tokenAmount[1].mul('995').div('1000'),
                            //     path,
                            //     wallet.address,
                            //     deadline
                            // ]);


                            // const txParams = {
                            //     to: tokens.router,
                            //     nonce: ethers.utils.hexlify(nonce),
                            //     gasLimit: ethers.BigNumber.from(gasLimit).toHexString(),
                            //     gasPrice: ethers.BigNumber.from(newGasPrice).toHexString(),
                            //     value: ethers.utils.parseEther("0.01").toHexString(),
                            //     data: open_encodedABI,
                            //     chainId: chainId
                            // }
                            // const _tx = new EthereumTx(txParams, { common: BSC_MAIN })
                            // _tx.sign(Buffer.from(PRIVATE_KEY, "hex"));


                            // // let txHash = await provider.sendTransaction("0x" + _tx.serialize().toString("hex"));
                            // const signed = await wallet.signTransaction(txParams);
                            // let txHash = await provider.sendTransaction(signed);
                            // console.log("txhash", txHash.hash)
                            // let result = await txHash.wait()
                            // console.log("txhash", result)

                        } catch (ex) {
                            console.log(ex)
                        }
                        // const serializedTransaction = ownedTx.serialize();
                        // const raw = '0x' + serializedTransaction.toHexString();

                        // signer.signTransaction(raw, function (err, txHash) {
                        //     console.log(txHash)
                        // });

                    }
                }
            })
                .catch(() => { });
        });
    });

    provider._websocket.on("close", () => {
        console.log("WebSocket Closed. Reconnecting...");
        clearInterval(keepAliveInterval);
        clearTimeout(pingTimeout);
        startConnection();
    });

    provider._websocket.on("error", () => {
        console.log("Error. Attemptiing to Reconnect...");
        clearInterval(keepAliveInterval);
        clearTimeout(pingTimeout);
        startConnection();
    });

    provider._websocket.on("pong", () => {
        clearInterval(pingTimeout);
    });
};

startConnection()
