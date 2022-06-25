#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const fs = __importStar(require("fs"));
const mime_types_1 = __importDefault(require("mime-types"));
const path = __importStar(require("path"));
const prompts_1 = __importDefault(require("prompts"));
const ora_1 = __importDefault(require("ora"));
const anchor = __importStar(require("@project-serum/anchor"));
const spl_token_1 = require("@solana/spl-token");
const commander_1 = require("commander");
const form_data_1 = __importDefault(require("form-data"));
const loglevel_1 = __importDefault(require("loglevel"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const constants_1 = require("./constants");
const helpers_1 = require("./helpers");
const web3_js_1 = require("@solana/web3.js");
const transaction_1 = require("./helpers/transaction");
const SHDW_DECIMALS = 9;
const tokenMint = new anchor.web3.PublicKey("SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y");
const uploaderPubkey = new anchor.web3.PublicKey("972oJTFyjmVNsWM4GHEGPWUomAiJf2qrVotLtwnKmWem");
const emissionsPubkey = new anchor.web3.PublicKey("SHDWRWMZ6kmRG9CvKFSD7kVcnUqXMtd3SaMrLvWscbj");
commander_1.program.version("0.0.24");
commander_1.program.description("CLI for interacting with Shade Drive. This tool uses Solana's Mainnet-Beta network with an internal RPC configuration. It does not use your local Solana configurations.");
loglevel_1.default.setLevel(loglevel_1.default.levels.INFO);
loglevel_1.default.info("This is beta software. Use at your own discretion.");
programCommand("create-storage-account")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that will create the storage account")
    .requiredOption("-n, --name <string>", "What you want your storage account to be named. (Does not have to be unique)")
    .requiredOption("-s, --size <string>", "Amount of storage you are requesting to create. Should be in a string like '1KB', '1MB', '1GB'. Only KB, MB, and GB storage delineations are supported currently.")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    const storageConfigInfo = await programClient.account.storageConfig.fetch(storageConfig);
    let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
    let userInfoAccount = await connection.getAccountInfo(userInfo);
    let accountSeed = new anchor.BN(0);
    if (userInfoAccount !== null) {
        let userInfoData = await programClient.account.userInfo.fetch(userInfo);
        accountSeed = new anchor.BN(userInfoData.accountCounter);
    }
    else {
        const agreesToTos = await (0, prompts_1.default)({
            type: "confirm",
            name: "confirm",
            message: "By creating your first storage account on Shadow Drive, you agree to the Terms of Service as outlined here: https://shadowdrive.org. Confirm?",
            initial: false,
        });
        if (!agreesToTos.confirm) {
            loglevel_1.default.error("You must agree to the Terms of Service before creating your first storage account on Shadow Drive.");
            return;
        }
    }
    let storageInput = options.size;
    let storageInputAsBytes = (0, helpers_1.humanSizeToBytes)(storageInput);
    if (storageInputAsBytes === false) {
        loglevel_1.default.error(`${options.size} is not a valid input for size. Please use a string like '1KB', '1MB', '1GB'.`);
        return;
    }
    let shadesPerGb = storageConfigInfo.shadesPerGib.toNumber();
    const accountCostEstimate = Number(storageInputAsBytes) / 10 ** 9;
    const confirmStorageCost = await (0, prompts_1.default)({
        type: "confirm",
        name: "acceptStorageCost",
        message: `This storage account will require an estimated ${accountCostEstimate} SHDW to setup. Would you like to continue?`,
        initial: false,
    });
    if (!confirmStorageCost.acceptStorageCost) {
        return loglevel_1.default.error("You must accept the estimated storage cost to continue.");
    }
    loglevel_1.default.debug("storageInputAsBytes", storageInputAsBytes);
    let ata = await (0, helpers_1.findAssociatedTokenAddress)(keypair.publicKey, tokenMint);
    loglevel_1.default.debug("Associated token account: ", ata.toString());
    let storageRequested = new anchor.BN(storageInputAsBytes.toString());
    let identifier = options.name;
    let [storageAccount] = await anchor.web3.PublicKey.findProgramAddress([
        Buffer.from("storage-account"),
        keypair.publicKey.toBytes(),
        accountSeed.toTwos(2).toArrayLike(Buffer, "le", 4),
    ], programClient.programId);
    let [stakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
    loglevel_1.default.debug("storageRequested:", storageRequested);
    loglevel_1.default.debug("identifier:", identifier);
    loglevel_1.default.debug("storageAccount:", storageAccount);
    loglevel_1.default.debug("userInfo:", userInfo);
    loglevel_1.default.debug("stakeAccount:", stakeAccount);
    loglevel_1.default.debug("Sending off initializeAccount tx");
    const txn = await programClient.methods
        .initializeAccount(identifier, storageRequested, null)
        .accounts({
        storageConfig,
        userInfo,
        storageAccount,
        stakeAccount,
        tokenMint: tokenMint,
        owner1: keypair.publicKey,
        uploader: uploaderPubkey,
        owner1TokenAccount: ata,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
        .transaction();
    txn.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
    txn.feePayer = keypair.publicKey;
    txn.partialSign(keypair);
    const serializedTxn = txn.serialize({ requireAllSignatures: false });
    const txnSpinner = (0, ora_1.default)("Sending transaction to cluster. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        const uploadResponse = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/storage-account`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                transaction: Buffer.from(serializedTxn.toJSON().data).toString("base64"),
            }),
        });
        if (!uploadResponse.ok) {
            txnSpinner.fail("Error processing transaction. See below for details:");
            loglevel_1.default.error(`Server response status code: ${uploadResponse.status}`);
            loglevel_1.default.error(`Server response status message: ${(await uploadResponse.json()).error}`);
            return;
        }
        const responseJson = await uploadResponse.json();
        loglevel_1.default.debug(responseJson);
        txnSpinner.succeed(`Successfully created your new storage account of ${options.size} located at the following address on Solana: ${storageAccount.toString()}`);
        return;
    }
    catch (e) {
        txnSpinner.fail("Error processing transaction. See below for details:");
        loglevel_1.default.error(e);
        return;
    }
});
programCommand("upload-file")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that will upload the file")
    .requiredOption("-f, --file <string>", "File path. Current file size limit is 1GB through the CLI.")
    .option("-s, --storage-account <string>", "Storage account to upload file to.")
    .action(async (options, cmd) => {
    await handleUpload(options, cmd, "file");
});
programCommand("edit-file")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that will upload the file")
    .requiredOption("-f, --file <string>", "File path. Current file size limit is 1GB through the CLI. File must be named the same as the one you originally uploaded.")
    .requiredOption("-u, --url <string>", "Shadow Drive URL of the file you are requesting to delete.")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    const logOutputDirectory = options.outFileLocation || __dirname;
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    const fileStats = fs.statSync(options.file);
    const fileName = options.file.substring(options.file.lastIndexOf("/") + 1);
    let fileErrors = [];
    if (fileStats.size > 1073741824 * 1) {
        fileErrors.push({
            file: fileName,
            erorr: "Exceeds the 1GB limit.", //Its because of the nodejs file buffer limit. 
                                            //That can be lifted up to about 1.9gb before we have to write 
                                            //a new way of reading buffers in JS that’s a bit more
                                            // complex than just fs.readFile
        });
    }
    const fileNameBytes = new TextEncoder().encode(fileName).length;
    if (fileNameBytes > 32) {
        fileErrors.push({
            file: fileName,
            error: "File name too long. Reduce to 32 bytes long.",
        });
    }
    if (fileErrors.length) {
        loglevel_1.default.error("There are errors with the file you have selected. Please see the following error log.");
        return loglevel_1.default.error(fileErrors);
    }
    const fileData = fs.readFileSync(options.file);
    const fileExtension = fileName.substring(fileName.lastIndexOf(".") + 1);
    const fileContentType = mime_types_1.default.lookup(fileExtension);
    let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
    const userInfoAccount = await connection.getAccountInfo(userInfo);
    if (userInfoAccount === null) {
        return loglevel_1.default.error("You have not created a storage account on Shadow Drive yet. Please see the 'create-storage-account' command to get started.");
    }
    const existingFileData = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/get-object-data`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            location: options.url,
        }),
    });
    const fileDataResponse = await existingFileData.json();
    const fileOwnerOnChain = new anchor.web3.PublicKey(fileDataResponse.file_data["owner-account-pubkey"]);
    if (fileOwnerOnChain.toBase58() != keypair.publicKey.toBase58()) {
        return loglevel_1.default.error("Permission denied: Not file owner");
    }
    const file = new anchor.web3.PublicKey(fileDataResponse.file_data["file-account-pubkey"]);
    const storageAccount = new anchor.web3.PublicKey(fileDataResponse.file_data["storage-account-pubkey"]);
    const fileAccountOnChain = await programClient.account.file.fetch(file);
    const storageAccountOnChain = await programClient.account.storageAccount.fetch(storageAccount);
    let userInfoData = await programClient.account.userInfo.fetch(userInfo);
    loglevel_1.default.debug("userInfoData", userInfoData);
    const fd = new form_data_1.default();
    fd.append("file", fileData, {
        contentType: fileContentType,
        filename: fileName,
    });
    const hashSum = crypto_1.default.createHash("sha256");
    hashSum.update(fileData);
    const sha256Hash = hashSum.digest("hex");
    const creationDate = Math.round(new Date().getTime() / 1000);
    let size = new anchor.BN(fileStats.size);
    let created = new anchor.BN(creationDate);
    const url = encodeURI(`https://shdw-drive.genesysgo.net/${storageAccount.toString()}/${fileName}`);
    loglevel_1.default.debug({
        fileName,
        fileExtension,
        url,
        sha256Hash,
        created,
        size,
        storageConfig: storageConfig.toString(),
        storageAccount: storageAccount.toString(),
        file: file.toString(),
    });
    const txn = await programClient.methods
        .editFile(sha256Hash, size)
        .accounts({
        storageConfig: storageConfig,
        storageAccount: storageAccount,
        file: file,
        owner: keypair.publicKey,
        uploader: uploaderPubkey,
        tokenMint: tokenMint,
        systemProgram: anchor.web3.SystemProgram.programId,
    })
        .transaction();
    txn.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
    txn.feePayer = keypair.publicKey;
    txn.partialSign(keypair);
    const serializedTxn = txn.serialize({ requireAllSignatures: false });
    fd.append("transaction", Buffer.from(serializedTxn.toJSON().data).toString("base64"));
    const txnSpinner = (0, ora_1.default)(`Sending file edit request to the cluster. Subject to solana traffic conditions (w/ 120s timeout).`).start();
    try {
        const uploadResponse = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/edit`, {
            method: "POST",
            body: fd,
        });
        if (!uploadResponse.ok) {
            txnSpinner.fail("Error processing transaction. See below for details:");
            loglevel_1.default.error(`Server response status code: ${uploadResponse.status}`);
            loglevel_1.default.error(`Server response status message: ${(await uploadResponse.json()).error}`);
            return;
        }
        const responseJson = await uploadResponse.json();
        loglevel_1.default.debug(responseJson);
        let fileAccount = await programClient.account.file.fetch(file);
        txnSpinner.succeed(`File account updated: ${file.toString()}`);
        loglevel_1.default.info("Your finalized file location:", responseJson.finalized_location);
        loglevel_1.default.info(`Your Solana transaction signature: ${responseJson.transaction_signature}`);
        loglevel_1.default.info("Please allow 1-2 minutes for your data to be fully finalized on chain on Solana. Your files are immediately accessible.");
        loglevel_1.default.debug("Your file account values:");
        loglevel_1.default.debug({ fileAccount });
    }
    catch (e) {
        txnSpinner.fail(e.message);
    }
});
async function handleUpload(options, cmd, mode) {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    const programLogPath = path.join(process.cwd(), `shdw-drive-upload-${Math.round(new Date().getTime() / 100)}.json`);
    loglevel_1.default.info(`Writing upload logs to ${programLogPath}.`);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    let totalBytesToUpload = 0;
    let filesToRead = mode === "directory"
        ? fs.readdirSync(path.resolve(options.directory))
        : [path.resolve(options.file)];
    if (mode === "directory" && !fs.statSync(options.directory).isDirectory()) {
        return loglevel_1.default.error("Please select a folder of files to upload.");
    }
    const fileSpinner = (0, ora_1.default)("Collecting all files").start();
    let fileErrors = [];
    let fileData = [];
    filesToRead.forEach((file) => {
        const p = path.resolve(options.directory, file);
        const fileStats = fs.statSync(p);
        const fileName = file.substring(file.lastIndexOf("/") + 1);
        if (fileStats.size > 1073741824 * 1) {
            fileErrors.push({
                file: fileName,
                error: `Exceeds the 1GB file size limit`,
            });
        }
        totalBytesToUpload += fileStats.size;
        const fileNameBytes = new TextEncoder().encode(fileName).length;
        if (fileNameBytes >= 32) {
            fileErrors.push({
                file: fileName,
                error: "File name too long. Reduce to less than 32 bytes long.",
            });
        }
        const fileExtension = fileName.substring(fileName.lastIndexOf(".") + 1);
        const fileContentType = mime_types_1.default.lookup(fileExtension);
        const creationDate = Math.round(new Date().getTime() / 1000);
        let size = new anchor.BN(fileStats.size);
        let created = new anchor.BN(creationDate);
        const url = encodeURI(`https://shdw-drive.genesysgo.net/{replace}/${fileName}`);
        fileData.push({
            fileStats,
            fileName,
            fileExtension,
            contentType: fileContentType,
            creationDate,
            size,
            created,
            url,
        });
    });
    fileSpinner.succeed();
    if (fileErrors.length) {
        loglevel_1.default.error("There were issues with some of th files. See below for more details.");
        return loglevel_1.default.error(fileErrors);
    }
    let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
    const userInfoAccount = await connection.getAccountInfo(userInfo);
    if (userInfoAccount === null) {
        return loglevel_1.default.error("You have not created a storage account on Shadow Drive yet. Please see the 'create-storage-account' command to get started.");
    }
    let userInfoData = await programClient.account.userInfo.fetch(userInfo);
    let numberOfStorageAccounts = userInfoData.accountCounter - 1;
    let accountsToFetch = [];
    for (let i = 0; i <= numberOfStorageAccounts; i++) {
        let [acc] = await anchor.web3.PublicKey.findProgramAddress([
            Buffer.from("storage-account"),
            keypair.publicKey.toBytes(),
            new anchor.BN(i).toTwos(0).toArrayLike(Buffer, "le", 4),
        ], programClient.programId);
        accountsToFetch.push(acc);
    }
    let accounts = await programClient.account.storageAccount.fetchMultiple(accountsToFetch);
    accountsToFetch.forEach((accountPubkey, i) => {
        if (accounts[i]) {
            accounts[i].pubkey = accountPubkey;
        }
    });
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storage.toNumber(), true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storageAvailable.toNumber(), true, 2)
                : null,
            pubkey: accountsToFetch[idx],
            hasEnoughStorageForFile: (account === null || account === void 0 ? void 0 : account.identifier)
                ? totalBytesToUpload < account.storageAvailable
                : null,
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.toBeDeleted : null,
            initCounter: (account === null || account === void 0 ? void 0 : account.identifier) ? account.initCounter : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    let storageAccount;
    let storageAccountData;
    if (!options.storageAccount) {
        const pickedAccount = await (0, prompts_1.default)({
            type: "select",
            name: "option",
            message: "Which storage account do you want to use?",
            warn: "Not enough storage available on this account or the account is marked for deletion",
            choices: formattedAccounts.map((acc) => {
                return {
                    title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining`,
                    disabled: !acc.hasEnoughStorageForFile || acc.toBeDeleted,
                };
            }),
        });
        if (typeof pickedAccount.option === "undefined") {
            loglevel_1.default.error("You must pick a storage account to use for your upload.");
            return;
        }
        storageAccount = formattedAccounts[pickedAccount.option].pubkey;
        storageAccountData = formattedAccounts[pickedAccount.option];
    }
    else {
        storageAccount = new web3_js_1.PublicKey(options.storageAccount);
        storageAccountData = accounts.find((account) => {
            if (account &&
                account.pubkey &&
                account.pubkey instanceof web3_js_1.PublicKey) {
                return account.pubkey.equals(storageAccount);
            }
            return false;
        });
    }
    if (!storageAccount || !storageAccountData) {
        loglevel_1.default.error(`Could not find storage account: ${storageAccount.toString()}`);
        return;
    }
    fileData.forEach((file) => {
        file.url = file.url.replace("%7Breplace%7D", storageAccount.toString());
    });
    let allObjectsRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/list-objects`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            storageAccount: storageAccount.toString(),
        }),
    });
    if (!allObjectsRequest.status) {
        loglevel_1.default.error("Error getting a list of existing files. See details below and try your batch upload request again.");
        loglevel_1.default.error(`Response status: ${allObjectsRequest.status}`);
        loglevel_1.default.error(`Response message: ${(await allObjectsRequest.json()).error}`);
        return;
    }
    const allObjects = await allObjectsRequest.json();
    let existingFiles = [];
    fileData = fileData.filter((item) => {
        if (!allObjects.keys.includes(item.fileName)) {
            return true;
        }
        else {
            existingFiles.push({
                fileName: item.fileName,
                status: "Not uploaded: File already exists.",
                location: item.url,
            });
            return false;
        }
    });
    fs.writeFileSync(programLogPath, JSON.stringify(existingFiles));
    let chunks = [];
    let indivChunk = [];
    let chunkIdx = 0;
    function getChunkLength(array1, array2) {
        let starting = array1.length;
        if (array2.length) {
            return array2.reduce((total, next) => (total += next.length), starting);
        }
        return starting;
    }
    for (let chunkIdx = 0; chunkIdx < fileData.length; chunkIdx++) {
        if (indivChunk.length === 0) {
            indivChunk.push(chunkIdx);
            let allChunksSum = getChunkLength(indivChunk, chunks);
            if (allChunksSum === fileData.length) {
                chunks.push(indivChunk);
                continue;
            }
            continue;
        }
        let fileNames = indivChunk.map((c) => fileData[c].fileName);
        const namesLength = Buffer.byteLength(Buffer.from(fileNames));
        const currentNameBufferLength = Buffer.byteLength(Buffer.from(fileData[chunkIdx].fileName));
        if (indivChunk.length < 5 &&
            namesLength < 154 &&
            currentNameBufferLength + namesLength < 154) {
            indivChunk.push(chunkIdx);
            if (chunkIdx == fileData.length - 1) {
                chunks.push(indivChunk);
                indivChunk = [];
            }
        }
        else {
            chunks.push(indivChunk);
            indivChunk = [chunkIdx];
            let allChunksSum = getChunkLength(indivChunk, chunks);
            if (allChunksSum === fileData.length) {
                chunks.push(indivChunk);
                continue;
            }
        }
    }
    loglevel_1.default.debug("finished building chunks", chunks);
    let previousSeed = storageAccountData.initCounter;
    let newFileSeedToSet = storageAccountData.initCounter;
    let uploadLogs = [];
    for (let i = 0; i < chunks.length; i++) {
        let indivChunk = chunks[i];
        let actualFiles = [];
        let fileNames = [];
        let sha256Hashs = [];
        let createds = [];
        let sizes = [];
        let fileAccounts = [];
        let fileSeeds = [];
        let [userInfo] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
        loglevel_1.default.debug("Processing chunk:", i + 1);
        for (let j = 0; j <= indivChunk.length - 1; j++) {
            let index = indivChunk[j];
            const { fileName, fileExtension, fileStats, contentType, creationDate, size, created, url, } = fileData[index];
            let fileSeed = new anchor.BN(newFileSeedToSet);
            let [fileAccount, fileBump] = await anchor.web3.PublicKey.findProgramAddress([
                storageAccount.toBytes(),
                new anchor.BN(fileSeed)
                    .toTwos(64)
                    .toArrayLike(Buffer, "le", 4),
            ], programClient.programId);
            fileNames.push(fileName);
            createds.push(created);
            sizes.push(size);
            fileAccounts.push({ fileAccount, seed: fileSeed });
            fileSeeds.push(fileSeed);
            const currentFilePath = mode === "directory"
                ? path.resolve(options.directory, fileName)
                : options.file;
            let data = fs.readFileSync(currentFilePath);
            const hashSum = crypto_1.default.createHash("sha256");
            hashSum.update(data);
            const sha256Hash = hashSum.digest("hex");
            sha256Hashs.push(sha256Hash);
            actualFiles.push({
                fileName,
                fileExtension,
                data,
                fileStats,
                contentType,
                sha256Hash,
                creationDate,
                size,
                created,
                url,
            });
            previousSeed = fileSeed.toNumber();
            newFileSeedToSet = fileSeed.toNumber() + 1;
        }
        let sortedFileAccounts = fileAccounts.sort((0, helpers_1.sortByProperty)("seed"));
        let continueToNextBatch = false;
        let currentRetries = 0;
        let accountReadyForNextTransaction = false;
        loglevel_1.default.info("Waiting for the Solana chain to have the most up to date storage account information...");
        let updatedStorageAccount;
        while (!accountReadyForNextTransaction) {
            updatedStorageAccount =
                await programClient.account.storageAccount.fetch(storageAccount);
            loglevel_1.default.debug("Expected next file seed on chain to be:", sortedFileAccounts[0].seed.toNumber());
            loglevel_1.default.debug("Actual next file seed on chain:", updatedStorageAccount.initCounter);
            if (updatedStorageAccount.initCounter ==
                sortedFileAccounts[0].seed.toNumber()) {
                loglevel_1.default.debug("Chain has up to date info. Moving onto the next batch.");
                accountReadyForNextTransaction = true;
            }
            else {
                loglevel_1.default.debug("Chain does not have up to date info. Waiting 1s to check again.");
            }
            await (0, helpers_1.sleep)(1000);
        }
        let existingUploadJSON = JSON.parse(fs.readFileSync(programLogPath, "utf-8"));
        while (!continueToNextBatch) {
            const txnSpinner = (0, ora_1.default)("Sending batch file txn").start();
            try {
                const txn = await programClient.methods
                    .storeFile(fileNames[0], sha256Hashs[0], sizes[0])
                    .accounts({
                    storageConfig,
                    storageAccount,
                    userInfo,
                    owner: keypair.publicKey,
                    uploader: uploaderPubkey,
                    tokenMint: tokenMint,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    file: sortedFileAccounts[0].fileAccount,
                })
                    .transaction();
                for (let fileIx = 1; fileIx < fileNames.length; fileIx++) {
                    const ixn = await programClient.methods
                        .storeFile(fileNames[fileIx], sha256Hashs[fileIx], sizes[fileIx])
                        .accounts({
                        storageConfig,
                        storageAccount,
                        userInfo,
                        owner: keypair.publicKey,
                        uploader: uploaderPubkey,
                        tokenMint: tokenMint,
                        systemProgram: anchor.web3.SystemProgram.programId,
                        file: sortedFileAccounts[fileIx].fileAccount,
                    })
                        .instruction();
                    txn.add(ixn);
                }
                txn.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                txn.feePayer = keypair.publicKey;
                txn.partialSign(keypair);
                const serializedTxn = txn.serialize({
                    requireAllSignatures: false,
                });
                const fd = new form_data_1.default();
                for (let j = 0; j < actualFiles.length; j++) {
                    fd.append("file", actualFiles[j].data, {
                        contentType: actualFiles[j].contentType,
                        filename: actualFiles[j].fileName,
                    });
                }
                fd.append("transaction", Buffer.from(serializedTxn.toJSON().data).toString("base64"));
                const request = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/upload-batch`, {
                    method: "POST",
                    body: fd,
                });
                if (!request.ok) {
                    const error = (await request.json()).error;
                    txnSpinner.fail("Error processing transaction. See below for details:");
                    loglevel_1.default.error(`Server response status code: ${request.status}`);
                    loglevel_1.default.error(`Server response status message: ${error}`);
                    if (error.toLowerCase().includes("timed out") ||
                        error.toLowerCase().includes("blockhash") ||
                        error.toLowerCase().includes("unauthorized signer") ||
                        error.toLowerCase().includes("node is behind") ||
                        error.toLowerCase().includes("was not confirmed in")) {
                        currentRetries += 1;
                        loglevel_1.default.error(`Transaction Retry #${currentRetries}`);
                    }
                    else {
                        newFileSeedToSet = updatedStorageAccount.initCounter;
                        fileNames.map((name, idx) => {
                            existingUploadJSON.push({
                                fileName: name,
                                status: `Not uploaded: ${error}`,
                                location: null,
                            });
                        });
                        continueToNextBatch = true;
                    }
                }
                else {
                    const responseJson = await request.json();
                    txnSpinner.succeed();
                    loglevel_1.default.info(`Solana transaction signature: ${responseJson.transaction_signature}`);
                    fileNames.map((name, idx) => {
                        existingUploadJSON.push({
                            fileName: name,
                            status: "Uploaded.",
                            location: actualFiles[idx].url,
                        });
                    });
                    continueToNextBatch = true;
                }
            }
            catch (e) {
                loglevel_1.default.error(e);
                fileNames.map((name, idx) => {
                    existingUploadJSON.push({
                        fileName: name,
                        status: `Not uploaded: ${e}`,
                        location: null,
                    });
                });
                continueToNextBatch = true;
                newFileSeedToSet = updatedStorageAccount.initCounter;
            }
        }
        fs.writeFileSync(programLogPath, JSON.stringify(existingUploadJSON));
        await (0, helpers_1.sleep)(500);
    }
}
programCommand("upload-multiple-files")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that will upload the files")
    .requiredOption("-d, --directory <string>", "Path to folder of files you want to upload.")
    .option("-s, --storage-account <string>", "Storage account to upload file to.")
    .action(async (options, cmd) => {
    await handleUpload(options, cmd, "directory");
});
programCommand("delete-file")
    .requiredOption("-kp, --keypair <string>", "Path to the keypair file for the wallet that owns the storage account and file")
    .requiredOption("-u, --url <string>", "Shadow Drive URL of the file you are requesting to delete.")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(path.resolve(options.keypair));
    loglevel_1.default.debug("Input params:", { options });
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    loglevel_1.default.info(`Retreiving the storage account associated with the file ${options.url}`);
    const fileData = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/get-object-data`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            location: options.url,
        }),
    });
    const fileDataResponse = await fileData.json();
    const fileOwnerOnChain = new anchor.web3.PublicKey(fileDataResponse.file_data["owner-account-pubkey"]);
    if (fileOwnerOnChain.toBase58() != keypair.publicKey.toBase58()) {
        return loglevel_1.default.error("Permission denied: Not file owner");
    }
    const fileAccount = new anchor.web3.PublicKey(fileDataResponse.file_data["file-account-pubkey"]);
    const storageAccount = new anchor.web3.PublicKey(fileDataResponse.file_data["storage-account-pubkey"]);
    const fileAccountOnChain = await programClient.account.file.fetch(fileAccount);
    const storageAccountOnChain = await programClient.account.storageAccount.fetch(storageAccount);
    loglevel_1.default.debug({ fileAccountOnChain });
    loglevel_1.default.debug({ storageAccountOnChain });
    const txnSpinner = (0, ora_1.default)("Sending delete file request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        const transaction = await programClient.methods
            .requestDeleteFile()
            .accounts({
            storageConfig,
            storageAccount,
            file: fileAccount,
            owner: keypair.publicKey,
            tokenMint: tokenMint,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
            .transaction();
        transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
        transaction.feePayer = keypair.publicKey;
        transaction.sign(keypair);
        await (0, transaction_1.sendAndConfirm)(provider.connection, transaction.serialize(), { skipPreflight: false }, "max", 120000);
    }
    catch (e) {
        txnSpinner.fail("Failed to submit delete file request. See below for details:");
        return loglevel_1.default.error(e);
    }
    txnSpinner.succeed(`File account delete request submitted for ${options.url}. You have until the end of the current Solana Epoch to revert your deletion request. Once the account is fully deleted, you will receive the SOL rent and SHDW staked back in your wallet.`);
    return;
});
programCommand("undelete-file")
    .requiredOption("-kp, --keypair <string>", "Path to the keypair file for the wallet that owns the storage account and file")
    .requiredOption("-u, --url <string>", "Shadow Drive URL of the file you are requesting to delete.")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(path.resolve(options.keypair));
    loglevel_1.default.debug("Input params:", { options });
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    loglevel_1.default.info(`Retreiving the storage account associated with the file ${options.url}`);
    const fileData = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/get-object-data`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            location: options.url,
        }),
    });
    const fileDataResponse = await fileData.json();
    const fileOwnerOnChain = new anchor.web3.PublicKey(fileDataResponse.file_data["owner-account-pubkey"]);
    if (fileOwnerOnChain.toBase58() != keypair.publicKey.toBase58()) {
        return loglevel_1.default.error("Permission denied: Not file owner");
    }
    const fileAccount = new anchor.web3.PublicKey(fileDataResponse.file_data["file-account-pubkey"]);
    const storageAccount = new anchor.web3.PublicKey(fileDataResponse.file_data["storage-account-pubkey"]);
    const fileAccountOnChain = await programClient.account.file.fetch(fileAccount);
    const storageAccountOnChain = await programClient.account.storageAccount.fetch(storageAccount);
    let [stakeAccount, stakeAccountBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
    loglevel_1.default.debug({ fileAccountOnChain });
    loglevel_1.default.debug({ storageAccountOnChain });
    const txnSpinner = (0, ora_1.default)("Sending undelete file request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        const transaction = await programClient.methods
            .unmarkDeleteFile()
            .accounts({
            storageConfig,
            storageAccount,
            file: fileAccount,
            stakeAccount,
            owner: keypair.publicKey,
            tokenMint: tokenMint,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
            .transaction();
        transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
        transaction.feePayer = keypair.publicKey;
        transaction.sign(keypair);
        await (0, transaction_1.sendAndConfirm)(provider.connection, transaction.serialize(), { skipPreflight: false }, "max", 120000);
    }
    catch (e) {
        txnSpinner.fail("Failed to submit undelete file request. See below for details:");
        return loglevel_1.default.error(e);
    }
    txnSpinner.succeed("File account undelete request submitted. Your file will no longer be removed.");
});
programCommand("get-storage-account")
    .requiredOption("-kp, --keypair <string>", "Path to the keypair file for the wallet that you want to find storage accounts for.")
    .action(async (options, cmd) => {
    var _a;
    const keypair = (0, helpers_1.loadWalletKey)(path.resolve(options.keypair));
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
    const userInfoAccount = await connection.getAccountInfo(userInfo);
    if (userInfoAccount === null) {
        return loglevel_1.default.error("You have not created a storage account yet on Shadow Drive. Please see the 'create-storage-account' command to get started.");
    }
    const userInfoData = await programClient.account.userInfo.fetch(userInfo);
    const numberOfStorageAccounts = userInfoData.accountCounter - 1;
    let accountsToFetch = [];
    for (let i = 0; i <= numberOfStorageAccounts; i++) {
        let [acc] = await anchor.web3.PublicKey.findProgramAddress([
            Buffer.from("storage-account"),
            keypair.publicKey.toBytes(),
            new anchor.BN(i).toTwos(0).toArrayLike(Buffer, "le", 4),
        ], programClient.programId);
        accountsToFetch.push(acc);
    }
    let accounts = await programClient.account.storageAccount.fetchMultiple(accountsToFetch);
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            initCounter: account === null || account === void 0 ? void 0 : account.initCounter,
            delCounter: account === null || account === void 0 ? void 0 : account.delCounter,
            deleteRequestTime: account === null || account === void 0 ? void 0 : account.deleteRequestTime,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storage.toNumber(), true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storageAvailable.toNumber(), true, 2)
                : null,
            storage: account === null || account === void 0 ? void 0 : account.storage,
            owner1: account === null || account === void 0 ? void 0 : account.owner1,
            owner2: account === null || account === void 0 ? void 0 : account.owner2,
            accountCounterSeed: account === null || account === void 0 ? void 0 : account.accountCounterSeed,
            totalCostOfCurrentStorage: account === null || account === void 0 ? void 0 : account.totalCostOfCurrentStorage,
            totalFeesPaid: account === null || account === void 0 ? void 0 : account.totalFeesPaid,
            creationTime: account === null || account === void 0 ? void 0 : account.creationTime,
            creationEpoch: account === null || account === void 0 ? void 0 : account.creationEpoch,
            lastFeeEpoch: account === null || account === void 0 ? void 0 : account.lastFeeEpoch,
            shdwPayer: account === null || account === void 0 ? void 0 : account.shdwPayer,
            pubkey: accountsToFetch[idx],
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.toBeDeleted : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to get info for?",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} available of ${acc.totalStorage} reserved`,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to continue.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option];
    const formattedStorageAccount = {
        identifier: storageAccount.identifier,
        initCounter: storageAccount.initCounter.toString(),
        delCounter: storageAccount.delCounter.toString(),
        deleteRequestTime: (_a = storageAccount.deleteRequestTime) === null || _a === void 0 ? void 0 : _a.toString(),
        storage: storageAccount.storage.toString(),
        storageAvailable: storageAccount.storageAvailable.toString(),
        owner1: storageAccount.owner1.toString(),
        owner2: storageAccount.owner2.toString(),
        accountCounterSeed: storageAccount.accountCounterSeed.toString(),
        totalCostOfCurrentStorage: storageAccount.totalCostOfCurrentStorage.toString(),
        totalFeesPaid: storageAccount.totalFeesPaid.toString(),
        creationTime: storageAccount.creationTime.toString(),
        creationEpoch: storageAccount.creationEpoch.toString(),
        lastFeeEpoch: storageAccount.lastFeeEpoch.toString(),
        shdwPayer: storageAccount.shdwPayer.toString(),
        toBeDeleted: storageAccount.toBeDeleted.toString(),
    };
    loglevel_1.default.info(`Information for storage account ${storageAccount.identifier} - ${accountsToFetch[pickedAccount.option]}:`);
    loglevel_1.default.info(formattedStorageAccount);
});
programCommand("delete-storage-account")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that owns the storage account")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
    const userInfoAccount = await connection.getAccountInfo(userInfo);
    if (userInfoAccount === null) {
        return loglevel_1.default.error("You have not created a storage account on Shadow Drive yet. Please see the 'create-storage-account' command to get started.");
    }
    let userInfoData = await programClient.account.userInfo.fetch(userInfo);
    let numberOfStorageAccounts = userInfoData.accountCounter - 1;
    let accountsToFetch = [];
    for (let i = 0; i <= numberOfStorageAccounts; i++) {
        let [acc] = await anchor.web3.PublicKey.findProgramAddress([
            Buffer.from("storage-account"),
            keypair.publicKey.toBytes(),
            new anchor.BN(i).toTwos(0).toArrayLike(Buffer, "le", 4),
        ], programClient.programId);
        accountsToFetch.push(acc);
    }
    let accounts = await programClient.account.storageAccount.fetchMultiple(accountsToFetch);
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storage.toNumber(), true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storageAvailable.toNumber(), true, 2)
                : null,
            pubkey: accountsToFetch[idx],
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.toBeDeleted : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to delete?",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining`,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to add storage to.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const storageAccountData = accounts[pickedAccount.option];
    const [stakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
    loglevel_1.default.debug({
        storageAccount: storageAccount.toString(),
    });
    const txnSpinner = (0, ora_1.default)("Sending storage account deletion request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        const transaction = await programClient.methods
            .requestDeleteAccount()
            .accounts({
            storageConfig,
            storageAccount,
            owner: keypair.publicKey,
            tokenMint: tokenMint,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
            .transaction();
        transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
        transaction.feePayer = keypair.publicKey;
        transaction.sign(keypair);
        await (0, transaction_1.sendAndConfirm)(provider.connection, transaction.serialize(), { skipPreflight: false }, "max", 120000);
    }
    catch (e) {
        txnSpinner.fail("Error sending transaction. Please see information below.");
        return loglevel_1.default.error(e);
    }
    txnSpinner.succeed(`Storage account deletion request successfully submitted for account ${storageAccount.toString()}. You have until the end of the current Solana Epoch to revert this account deletion request. Once the account is fully deleted, you will receive the SOL rent and SHDW staked back in your wallet.`);
});
programCommand("undelete-storage-account")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that owns the storage account")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
    const userInfoAccount = await connection.getAccountInfo(userInfo);
    if (userInfoAccount === null) {
        return loglevel_1.default.error("You have not created a storage account on Shadow Drive yet. Please see the 'create-storage-account' command to get started.");
    }
    let userInfoData = await programClient.account.userInfo.fetch(userInfo);
    let numberOfStorageAccounts = userInfoData.accountCounter - 1;
    let accountsToFetch = [];
    for (let i = 0; i <= numberOfStorageAccounts; i++) {
        let [acc] = await anchor.web3.PublicKey.findProgramAddress([
            Buffer.from("storage-account"),
            keypair.publicKey.toBytes(),
            new anchor.BN(i).toTwos(0).toArrayLike(Buffer, "le", 4),
        ], programClient.programId);
        accountsToFetch.push(acc);
    }
    let accounts = await programClient.account.storageAccount.fetchMultiple(accountsToFetch);
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storage.toNumber(), true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storageAvailable.toNumber(), true, 2)
                : null,
            pubkey: accountsToFetch[idx],
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.toBeDeleted : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to unmark for deletion?",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining`,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to unmark for deletion.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const storageAccountData = accounts[pickedAccount.option];
    const [stakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
    loglevel_1.default.debug({
        storageAccount: storageAccount.toString(),
    });
    const txnSpinner = (0, ora_1.default)("Sending storage account undelete request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        const transaction = await programClient.methods
            .unmarkDeleteAccount()
            .accounts({
            storageConfig,
            storageAccount,
            stakeAccount,
            owner: keypair.publicKey,
            tokenMint: tokenMint,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
            .transaction();
        transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
        transaction.feePayer = keypair.publicKey;
        transaction.sign(keypair);
        await (0, transaction_1.sendAndConfirm)(provider.connection, transaction.serialize(), { skipPreflight: false }, "max", 120000);
    }
    catch (e) {
        txnSpinner.fail("Error sending transaction. Please see information below.");
        return loglevel_1.default.error(e);
    }
    txnSpinner.succeed(`Storage account undelete request successfully submitted for account ${storageAccount.toString()}. This account will no longer be deleted.`);
});
programCommand("add-storage")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that will upload the files")
    .requiredOption("-s, --size <string>", "Amount of storage you are requesting to add to your storage account. Should be in a string like '1KB', '1MB', '1GB'. Only KB, MB, and GB storage delineations are supported currently.")
    .action(async (options, cmd) => {
    let storageInput = options.size;
    let storageInputAsBytes = (0, helpers_1.humanSizeToBytes)(storageInput);
    if (storageInputAsBytes === false) {
        loglevel_1.default.error(`${options.size} is not a valid input for size. Please use a string like '1KB', '1MB', '1GB'.`);
        return;
    }
    loglevel_1.default.debug("storageInputAsBytes", storageInputAsBytes);
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
    const userInfoAccount = await connection.getAccountInfo(userInfo);
    if (userInfoAccount === null) {
        return loglevel_1.default.error("You have not created a storage account on Shadow Drive yet. Please see the 'create-storage-account' command to get started.");
    }
    let userInfoData = await programClient.account.userInfo.fetch(userInfo);
    let numberOfStorageAccounts = userInfoData.accountCounter - 1;
    let accountsToFetch = [];
    for (let i = 0; i <= numberOfStorageAccounts; i++) {
        let [acc] = await anchor.web3.PublicKey.findProgramAddress([
            Buffer.from("storage-account"),
            keypair.publicKey.toBytes(),
            new anchor.BN(i).toTwos(0).toArrayLike(Buffer, "le", 4),
        ], programClient.programId);
        accountsToFetch.push(acc);
    }
    let accounts = await programClient.account.storageAccount.fetchMultiple(accountsToFetch);
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storage.toNumber(), true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storageAvailable.toNumber(), true, 2)
                : null,
            pubkey: accountsToFetch[idx],
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.toBeDeleted : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to add storage to?",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining`,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to add storage to.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const storageAccountData = accounts[pickedAccount.option];
    const [stakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
    const stakeBalance = new anchor.BN((await provider.connection.getTokenAccountBalance(stakeAccount)).value.amount);
    const ownerAta = await (0, helpers_1.findAssociatedTokenAddress)(keypair.publicKey, tokenMint);
    loglevel_1.default.debug({
        storageAccount: storageAccount.toString(),
        stakeAccount: stakeAccount.toString(),
        ownerAta: ownerAta.toString(),
    });
    const txnSpinner = (0, ora_1.default)("Sending add storage request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        const transaction = await programClient.methods
            .increaseStorage(new anchor.BN(storageInputAsBytes.toString()))
            .accounts({
            storageConfig,
            storageAccount,
            owner: keypair.publicKey,
            ownerAta,
            stakeAccount,
            tokenMint: tokenMint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .transaction();
        transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
        transaction.feePayer = keypair.publicKey;
        transaction.sign(keypair);
        await (0, transaction_1.sendAndConfirm)(provider.connection, transaction.serialize(), { skipPreflight: false }, "max", 120000);
    }
    catch (e) {
        txnSpinner.fail("Error sending transaction. Please see information below.");
        return loglevel_1.default.error(e);
    }
    const newAccountInfo = await programClient.account.storageAccount.fetch(storageAccount);
    txnSpinner.succeed(`Storage account capacity successfully increased to ${(0, helpers_1.bytesToHuman)(newAccountInfo.storage, true, 2)} total with ${(0, helpers_1.bytesToHuman)(newAccountInfo.storageAvailable, true, 2)} currently available.`);
    return;
});
programCommand("make-storage-account-immutable")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that you want to make immutable")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
    const userInfoAccount = await connection.getAccountInfo(userInfo);
    if (userInfoAccount === null) {
        return loglevel_1.default.error("You have not created a storage account on Shadow Drive yet. Please see the 'create-storage-account' command to get started.");
    }
    let userInfoData = await programClient.account.userInfo.fetch(userInfo);
    let numberOfStorageAccounts = userInfoData.accountCounter - 1;
    let accountsToFetch = [];
    for (let i = 0; i <= numberOfStorageAccounts; i++) {
        let [acc] = await anchor.web3.PublicKey.findProgramAddress([
            Buffer.from("storage-account"),
            keypair.publicKey.toBytes(),
            new anchor.BN(i).toTwos(0).toArrayLike(Buffer, "le", 4),
        ], programClient.programId);
        accountsToFetch.push(acc);
    }
    let accounts = await programClient.account.storageAccount.fetchMultiple(accountsToFetch);
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storage.toNumber(), true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storageAvailable.toNumber(), true, 2)
                : null,
            pubkey: accountsToFetch[idx],
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.toBeDeleted : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to make immutable?",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining`,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to make immutable.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const storageAccountData = accounts[pickedAccount.option];
    const [stakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
    const stakeBalance = new anchor.BN((await provider.connection.getTokenAccountBalance(stakeAccount)).value.amount);
    const ownerAta = await (0, helpers_1.findAssociatedTokenAddress)(keypair.publicKey, tokenMint);
    const emissionsAta = await (0, helpers_1.findAssociatedTokenAddress)(emissionsPubkey, tokenMint);
    loglevel_1.default.debug({
        storageAccount: storageAccount.toString(),
        stakeAccount: stakeAccount.toString(),
        ownerAta: ownerAta.toString(),
        emissionsAta: emissionsAta.toString(),
    });
    const txnSpinner = (0, ora_1.default)("Sending make account immutable request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        const transaction = await programClient.methods
            .makeAccountImmutable()
            .accounts({
            storageConfig,
            storageAccount,
            owner: keypair.publicKey,
            ownerAta,
            stakeAccount,
            emissionsWallet: emissionsAta,
            tokenMint: tokenMint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
        })
            .transaction();
        transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
        transaction.feePayer = keypair.publicKey;
        transaction.sign(keypair);
        await (0, transaction_1.sendAndConfirm)(provider.connection, transaction.serialize(), { skipPreflight: false }, "max", 120000);
    }
    catch (e) {
        txnSpinner.fail("Error sending transaction. Please see information below.");
        return loglevel_1.default.error(e);
    }
    const newAccountInfo = await programClient.account.storageAccount.fetch(storageAccount);
    txnSpinner.succeed(`Storage account ${storageAccount.toString()} has been marked as immutable. Files can no longer be deleted from this storage account.`);
});
programCommand("reduce-storage")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that owns the storage account you want to reduce.")
    .requiredOption("-s, --size <string>", "Amount of storage you are requesting to reduce from your storage account. Should be in a string like '1KB', '1MB', '1GB'. Only KB, MB, and GB storage delineations are supported currently.")
    .action(async (options, cmd) => {
    let storageInput = options.size;
    let storageInputAsBytes = (0, helpers_1.humanSizeToBytes)(storageInput);
    if (storageInputAsBytes === false) {
        loglevel_1.default.error(`${options.size} is not a valid input for size. Please use a string like '1KB', '1MB', '1GB'.`);
        return;
    }
    loglevel_1.default.debug("storageInputAsBytes", storageInputAsBytes);
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    const storageConfigData = await programClient.account.storageConfig.fetch(storageConfig);
    let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
    const userInfoAccount = await connection.getAccountInfo(userInfo);
    if (userInfoAccount === null) {
        return loglevel_1.default.error("You have not created a storage account on Shadow Drive yet. Please see the 'create-storage-account' command to get started.");
    }
    let userInfoData = await programClient.account.userInfo.fetch(userInfo);
    let numberOfStorageAccounts = userInfoData.accountCounter - 1;
    let accountsToFetch = [];
    for (let i = 0; i <= numberOfStorageAccounts; i++) {
        let [acc] = await anchor.web3.PublicKey.findProgramAddress([
            Buffer.from("storage-account"),
            keypair.publicKey.toBytes(),
            new anchor.BN(i).toTwos(0).toArrayLike(Buffer, "le", 4),
        ], programClient.programId);
        accountsToFetch.push(acc);
    }
    let accounts = await programClient.account.storageAccount.fetchMultiple(accountsToFetch);
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storage.toNumber(), true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.storageAvailable.toNumber(), true, 2)
                : null,
            pubkey: accountsToFetch[idx],
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.toBeDeleted : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to reduce storage on?",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining`,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to reduce storage on.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const storageAccountData = accounts[pickedAccount.option];
    let [stakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
    const [unstakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("unstake-account"), storageAccount.toBytes()], programClient.programId);
    const [unstakeInfo] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("unstake-info"), storageAccount.toBytes()], programClient.programId);
    const ownerAta = await (0, helpers_1.findAssociatedTokenAddress)(keypair.publicKey, tokenMint);
    const emissionsAta = await (0, helpers_1.findAssociatedTokenAddress)(emissionsPubkey, tokenMint);
    loglevel_1.default.debug({
        storageAccount: storageAccount.toString(),
        unstakeAccount: unstakeAccount.toString(),
        unstakeInfo: unstakeInfo.toString(),
        ownerAta: ownerAta.toString(),
        stakeAccount: stakeAccount.toString(),
    });
    const txnSpinner = (0, ora_1.default)("Sending reduce storage request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        const transaction = await programClient.methods
            .decreaseStorage(new anchor.BN(storageInputAsBytes.toString()))
            .accounts({
            storageConfig,
            storageAccount,
            unstakeInfo,
            unstakeAccount,
            owner: keypair.publicKey,
            ownerAta,
            stakeAccount,
            emissionsWallet: emissionsAta,
            tokenMint: tokenMint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
            .transaction();
        transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
        transaction.feePayer = keypair.publicKey;
        transaction.sign(keypair);
        await (0, transaction_1.sendAndConfirm)(provider.connection, transaction.serialize(), { skipPreflight: false }, "max", 120000);
    }
    catch (e) {
        txnSpinner.fail("Error sending transaction. Please see information below.");
        return loglevel_1.default.error(e);
    }
    const newAccountInfo = await programClient.account.storageAccount.fetch(storageAccount);
    txnSpinner.succeed(`Storage account capacity successfully decreased to ${(0, helpers_1.bytesToHuman)(newAccountInfo.storage, true, 2)} total with ${(0, helpers_1.bytesToHuman)(newAccountInfo.storageAvailable, true, 2)} currently available.\nPlease see the "claim-stake" command to recover the stake from this reduction request.`);
});
programCommand("claim-stake")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that owns the storage account you want to claim available stake from.")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
    let programConstants = Object.assign({}, ...programClient.idl.constants.map((x) => ({ [x.name]: x.value })));
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    const storageConfigData = await programClient.account.storageConfig.fetch(storageConfig);
    const currentEpoch = (await provider.connection.getEpochInfo()).epoch;
    let unstakeEpochperiod = parseInt(programConstants["UNSTAKE_EPOCH_PERIOD"]);
    let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
    const userInfoAccount = await connection.getAccountInfo(userInfo);
    if (userInfoAccount === null) {
        return loglevel_1.default.error("You have not created a storage account on Shadow Drive yet. Please see the 'create-storage-account' command to get started.");
    }
    let userInfoData = await programClient.account.userInfo.fetch(userInfo);
    let numberOfStorageAccounts = userInfoData.accountCounter - 1;
    let accountsToFetch = [];
    const accountFetchSpinner = (0, ora_1.default)("Fetching all storage accounts and claimable stake").start();
    for (let i = 0; i <= numberOfStorageAccounts; i++) {
        let [acc] = await anchor.web3.PublicKey.findProgramAddress([
            Buffer.from("storage-account"),
            keypair.publicKey.toBytes(),
            new anchor.BN(i).toTwos(0).toArrayLike(Buffer, "le", 4),
        ], programClient.programId);
        accountsToFetch.push(acc);
    }
    let accounts = await (await programClient.account.storageAccount.fetchMultiple(accountsToFetch))
        .filter((acc, idx) => {
        if (acc) {
            return acc;
        }
        accountsToFetch.splice(idx, 1);
    });
    let formattedAccounts = await Promise.all(accounts.map(async (account, idx) => {
        const accountKey = new anchor.web3.PublicKey(accountsToFetch[idx]);
        let unstakeInfo, unstakeAccount;
        try {
            [unstakeInfo] =
                await anchor.web3.PublicKey.findProgramAddress([Buffer.from("unstake-info"), accountKey.toBytes()], programClient.programId);
            [unstakeAccount] =
                await anchor.web3.PublicKey.findProgramAddress([
                    Buffer.from("unstake-account"),
                    accountKey.toBytes(),
                ], programClient.programId);
        }
        catch (e) {
            return;
        }
        let unstakeInfoData;
        let unstakeTokenAccount;
        let unstakeTokenAccountBalance;
        try {
            unstakeInfoData =
                await programClient.account.unstakeInfo.fetch(unstakeInfo);
        }
        catch (e) {
            return null;
        }
        try {
            unstakeTokenAccountBalance =
                await connection.getTokenAccountBalance(unstakeAccount);
        }
        catch (e) {
            console.log(e);
            return null;
        }
        return {
            identifier: account.identifier,
            totalStorage: (0, helpers_1.bytesToHuman)(account.storage.toNumber(), true, 2),
            storageAvailable: (0, helpers_1.bytesToHuman)(account.storageAvailable.toNumber(), true, 2),
            pubkey: accountsToFetch[idx],
            unstakeAccount: unstakeAccount,
            unstakeInfoAccount: unstakeInfo,
            unstakeInfoData: unstakeInfoData,
            unstakeTokenAccountBalance,
            currentEpoch,
            claimableEpoch: unstakeInfoData.epochLastUnstaked.toNumber() +
                unstakeEpochperiod,
        };
    }));
    formattedAccounts = formattedAccounts.filter((account) => account != null);
    accountFetchSpinner.succeed();
    if (formattedAccounts.length === 0) {
        return loglevel_1.default.error("You don't have any storage accounts with claimable stake.");
    }
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to reduce storage on?",
        warn: "Account not eligible for stake claim yet. Please wait until the epoch specified.",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.unstakeTokenAccountBalance.value.uiAmount} $SHDW claimable on or after Solana Epoch ${acc.claimableEpoch}`,
                disabled: currentEpoch < acc.claimableEpoch,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        return loglevel_1.default.error("You must pick a storage account to reduce storage on.");
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const storageAccountData = accounts[pickedAccount.option];
    const formattedAccount = formattedAccounts[pickedAccount.option];
    const txnSpinner = (0, ora_1.default)("Sending claim stake transaction request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    const ownerAta = await (0, helpers_1.findAssociatedTokenAddress)(keypair.publicKey, tokenMint);
    try {
        let transaction = await programClient.methods
            .claimStake()
            .accounts({
            storageConfig,
            storageAccount,
            unstakeInfo: formattedAccount.unstakeInfoAccount,
            unstakeAccount: formattedAccount.unstakeAccount,
            owner: keypair.publicKey,
            ownerAta,
            tokenMint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .transaction();
        transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
        transaction.feePayer = keypair.publicKey;
        transaction.sign(keypair);
        await (0, transaction_1.sendAndConfirm)(provider.connection, transaction.serialize(), { skipPreflight: false }, "max", 120000);
        txnSpinner.succeed(`You have claimed ${formattedAccount.unstakeTokenAccountBalance.value.uiAmount} $SHDW from your storage account ${storageAccount}.`);
    }
    catch (e) {
        txnSpinner.fail("Error sending transaction. See below for details:");
        console.log(e);
    }
});
programCommand("show-files")
     .requiredOption("-kp, --keypair <string>", "Path to the keypair file for the wallet that you want to find storage accounts for.")
     .action(async (options, cmd) => {
     const keypair = (0, helpers_1.loadWalletKey)(path.resolve(options.keypair));
     const connection = new anchor.web3.Connection(options.rpc);
     const [programClient, provider] = (0, helpers_1.getAnchorEnvironmet)(keypair, connection);
     let [userInfo, userInfoBump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
     const userInfoAccount = await connection.getAccountInfo(userInfo);
     if (userInfoAccount === null) {
         return loglevel_1.default.error("You have not created a storage account on Shadow Drive yet. Please see the 'create-storage-account' command to get started.");
     }
     let userInfoData = await programClient.account.userInfo.fetch(userInfo);
     let numberOfStorageAccounts = userInfoData.accountCounter - 1;
     let accountsToFetch = [];
     for (let i = 0; i <= numberOfStorageAccounts; i++) {
         let [acc] = await anchor.web3.PublicKey.findProgramAddress([
             Buffer.from("storage-account"),
             keypair.publicKey.toBytes(),
             new anchor.BN(i).toTwos(0).toArrayLike(Buffer, "le", 4),
         ], programClient.programId);
         accountsToFetch.push(acc);
     }
     let accounts = await programClient.account.storageAccount.fetchMultiple(accountsToFetch);
     accountsToFetch.forEach((accountPubkey, i) => {
         if (accounts[i]) {
             accounts[i].pubkey = accountPubkey;
         }
     });
     let alist1 = accounts.map((account, idx) => {
         return {
             identifier: account === null || account === void 0 ? void 0 : account.identifier,
             totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                 ? (0, helpers_1.bytesToHuman)(account.storage.toNumber(), true, 2)
                 : null,
             storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                 ? (0, helpers_1.bytesToHuman)(account.storageAvailable.toNumber(), true, 2)
                 : null,
             pubkey: accountsToFetch[idx],
             toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.toBeDeleted : null,
             initCounter: (account === null || account === void 0 ? void 0 : account.identifier) ? account.initCounter : null,
         };
     });
     let formattedAccounts = alist1.filter((acc, inx) => {
         if (acc.identifier) {
             return acc;
         }
     });
     let storageAccount;
     let storageAccountData;
     if (!options.storageAccount) {
         const pickedAccount = await (0, prompts_1.default)({
             type: "select",
             name: "option",
             message: "Which storage account do you want to see the contents of?",
             warn: "This account or the account is marked for deletion",
             choices: formattedAccounts.map((acc) => {
                 return {
                     title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining`,
                     disabled: acc.toBeDeleted,
                 };
             }),
         });
         if (typeof pickedAccount.option === "undefined") {
             loglevel_1.default.error("You must pick a storage account to show.");
             return;
         }
         storageAccount = formattedAccounts[pickedAccount.option].pubkey;
         storageAccountData = formattedAccounts[pickedAccount.option];
     }
     const fileSpinner = (0, ora_1.default)("Attempting to retrieve files").start();
     let allObjectsRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/list-objects`, {
         method: "POST",
         headers: {
             "Content-Type": "application/json",
         },
         body: JSON.stringify({
             storageAccount: storageAccount.toString(),
         }),
     });
     const allObjects = await allObjectsRequest.json();
    
     const files = []
    for (const file of allObjects.keys) {
        const fileUrl = `https://shdw-drive.genesysgo.net/${storageAccount.toString()}/${file}`;
        const fileData = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/get-object-data`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                location: fileUrl,
            }),
        });
        const fileDataResponse = await fileData.json();
        const fileAccount = new anchor.web3.PublicKey(fileDataResponse.file_data["file-account-pubkey"]);
        const fileAccountOnChain = await programClient.account.file.fetch(fileAccount);
        const fileSize = await (0, helpers_1.bytesToHuman)(fileAccountOnChain.size, true, 2);
        files.push({file: file,
                    size: fileSize});
    }
    function repeateString(string, times) {
        if (times < 0 ) {
            console.log('made it');
            return "";
        }
        if (times === 1) {
            return string;
        }
        else {
            return string + repeateString(string, times - 1);
        }
    }
    fileSpinner.succeed("\n-------Found the following files-------\n");
    for (let i =0; i < files.length; i++) {
        loglevel_1.default.info(`${files[i].file}${repeateString(".", 32 - files[i].file.length)}${files[i].size}`);
    };
     });
function programCommand(name) {
    let shdwProgram = commander_1.program
        .command(name)
        .option("-r, --rpc <string>", "Solana Mainnet RPC Endpoint", "https://ssc-dao.genesysgo.net")
        .option("-l, --log-level <string>", "log level", setLogLevel);
    return shdwProgram;
}
function setLogLevel(value, prev) {
    if (value === undefined || value === null) {
        return;
    }
    loglevel_1.default.info("setting the log value to: " + value);
    loglevel_1.default.setLevel(value);
}
commander_1.program.parse(process.argv);
//# sourceMappingURL=shdw-drive.js.map