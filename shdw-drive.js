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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const fs = __importStar(require("fs"));
const mime_types_1 = __importDefault(require("mime-types"));
const ora_1 = __importDefault(require("ora"));
const path = __importStar(require("path"));
const prompts_1 = __importDefault(require("prompts"));
const anchor = __importStar(require("@project-serum/anchor"));
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const commander_1 = require("commander");
const form_data_1 = __importDefault(require("form-data"));
const loglevel_1 = __importDefault(require("loglevel"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const constants_1 = require("./constants");
const helpers_1 = require("./helpers");
const transaction_1 = require("./helpers/transaction");
const rxjs_1 = require("rxjs");
const cli_progress_1 = __importDefault(require("cli-progress"));
const SHDW_DECIMALS = 9;
const tokenMint = new anchor.web3.PublicKey("SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y");
const uploaderPubkey = new anchor.web3.PublicKey("972oJTFyjmVNsWM4GHEGPWUomAiJf2qrVotLtwnKmWem");
const emissionsPubkey = new anchor.web3.PublicKey("SHDWRWMZ6kmRG9CvKFSD7kVcnUqXMtd3SaMrLvWscbj");
commander_1.program.version("0.2.2");
commander_1.program.description("CLI for interacting with Shade Drive. This tool uses Solana's Mainnet-Beta network with an internal RPC configuration. It does not use your local Solana configurations.");
loglevel_1.default.setLevel(loglevel_1.default.levels.INFO);
loglevel_1.default.info("This is beta software running on Solana's Mainnet. Use at your own discretion.");
programCommand("create-storage-account")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that will create the storage account")
    .requiredOption("-n, --name <string>", "What you want your storage account to be named. (Does not have to be unique)")
    .requiredOption("-s, --size <string>", "Amount of storage you are requesting to create. Should be in a string like '1KB', '1MB', '1GB'. Only KB, MB, and GB storage delineations are supported currently.")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
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
    const shadesPerGib = storageConfigInfo.shadesPerGib;
    const storageInputBigInt = new anchor.BN(Number(storageInputAsBytes));
    const bytesPerGib = new anchor.BN(constants_1.BYTES_PER_GIB);
    const accountCostEstimate = storageInputBigInt
        .mul(shadesPerGib)
        .div(bytesPerGib);
    const accountCostUiAmount = accountCostEstimate.toNumber() / 10 ** 9;
    const confirmStorageCost = await (0, prompts_1.default)({
        type: "confirm",
        name: "acceptStorageCost",
        message: `This storage account will require an estimated ${accountCostUiAmount} SHDW to setup. Would you like to continue?`,
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
        .initializeAccount2(identifier, storageRequested)
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
    const recentBlockhash = await connection.getLatestBlockhash("max");
    const blockHeight = await connection.getBlockHeight();
    txn.recentBlockhash = (await connection.getLatestBlockhash("max")).blockhash;
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
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
    const logOutputDirectory = options.outFileLocation || __dirname;
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    const fileStats = fs.statSync(options.file);
    const fileName = options.file.substring(options.file.lastIndexOf("/") + 1);
    let fileErrors = [];
    if (fileStats.size > 1073741824 * 1) {
        fileErrors.push({
            file: fileName,
            erorr: "Exceeds the 1GB limit.",
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
    const storageAccount = new anchor.web3.PublicKey(fileDataResponse.file_data["storage-account-pubkey"]);
    const storageAccountType = await (0, helpers_1.validateStorageAccount)(storageAccount, connection);
    if (!storageAccountType || storageAccountType === null) {
        return loglevel_1.default.error(`Storage account ${storageAccount.toString()} is not a valid Shadow Drive Storage Account.`);
    }
    let storageAccountOnChain;
    if (storageAccountType === "V1") {
        storageAccountOnChain =
            await programClient.account.storageAccount.fetch(storageAccount);
    }
    if (storageAccountType === "V2") {
        storageAccountOnChain =
            await programClient.account.storageAccountV2.fetch(storageAccount);
    }
    loglevel_1.default.debug({ storageAccountOnChain });
    let userInfoData = await programClient.account.userInfo.fetch(userInfo);
    loglevel_1.default.debug({ userInfoData });
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
    });
    let msg = `Shadow Drive Signed Message:\n StorageAccount: ${storageAccount.toString()}\nFile to edit: ${fileName}\nNew file hash: ${sha256Hash}`;
    const signature = (0, helpers_1.signMessage)(msg, keypair);
    fd.append("signer", keypair.publicKey.toString());
    fd.append("message", signature);
    fd.append("storage_account", storageAccount.toString());
    fd.append("url", options.url);
    try {
    }
    catch (e) {
        loglevel_1.default.error("Error with request");
        loglevel_1.default.error(e);
    }
    const txnSpinner = (0, ora_1.default)(`Sending file edit request to the cluster.`).start();
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
        txnSpinner.succeed(`File account updated: ${fileName}`);
        loglevel_1.default.info("Your finalized file location:", responseJson.finalized_location);
        loglevel_1.default.info("Your updated file is immediately accessible.");
    }
    catch (e) {
        txnSpinner.fail(e.message);
    }
});
async function handleUpload(options, cmd, mode) {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
    const programLogPath = path.join(process.cwd(), `shdw-drive-upload-${Math.round(new Date().getTime() / 100)}.json`);
    loglevel_1.default.info(`Writing upload logs to ${programLogPath}.`);
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
        loglevel_1.default.error("There were issues with some of the files. See below for more details.");
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
    let accounts = [];
    await Promise.all(accountsToFetch.map(async (account) => {
        const storageAccountDetails = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/storage-account-info`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                storage_account: account.toString(),
            }),
        });
        const storageAccountDetailsJson = await storageAccountDetails.json();
        if (storageAccountDetailsJson.identifier !== null &&
            typeof storageAccountDetailsJson.identifier !== "undefined") {
            accounts.push(storageAccountDetailsJson);
        }
        return storageAccountDetailsJson;
    }));
    loglevel_1.default.debug("accounts", accounts);
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes, true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes - account.current_usage, true, 2)
                : null,
            pubkey: account.storage_account,
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.to_be_deleted : null,
            version: (account === null || account === void 0 ? void 0 : account.identifier) ? account.version : null,
            creation_time: (account === null || account === void 0 ? void 0 : account.identifier) ? account.creation_time : null,
            immutable: (account === null || account === void 0 ? void 0 : account.identifier) ? account.immutable : null,
            accountCounterSeed: (account === null || account === void 0 ? void 0 : account.identifier)
                ? account.account_counter_seed
                : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    formattedAccounts = formattedAccounts.sort((0, helpers_1.sortByProperty)("accountCounterSeed"));
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
                    title: `${acc.identifier} - ${acc.pubkey} - ${acc.storageAvailable} available - ${acc.version}`,
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
        storageAccount = options.storageAccount;
        storageAccountData = alist1.find((account) => {
            const accountPubkey = new web3_js_1.PublicKey(account.pubkey);
            if (account &&
                accountPubkey &&
                accountPubkey instanceof web3_js_1.PublicKey) {
                return accountPubkey.equals(new web3_js_1.PublicKey(storageAccount));
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
        if (indivChunk.length < 5) {
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
    const allFileNames = fileData.map((file) => file.fileName);
    const hashSum = crypto_1.default.createHash("sha256");
    hashSum.update(allFileNames.toString());
    const fileNamesHashed = hashSum.digest("hex");
    loglevel_1.default.debug("finished building chunks", chunks);
    let newFileSeedToSet = storageAccountData.initCounter;
    let existingUploadJSON = JSON.parse(fs.readFileSync(programLogPath, "utf-8"));
    const logPath = path.join(process.cwd(), `shdw-drive-upload-${Math.round(new Date().getTime() / 1000)}.json`);
    if (!chunks.length) {
        loglevel_1.default.info("All files already uploaded!");
        process.exit(1);
    }
    const concurrent = options.concurrent ? parseInt(options.concurrent) : 3;
    const appendFileToItem = (item) => {
        const { fileName } = item, props = __rest(item, ["fileName"]);
        const currentFilePath = mode === "directory"
            ? path.resolve(options.directory, fileName)
            : options.file;
        let data = fs.readFileSync(currentFilePath);
        return Object.assign(Object.assign({}, props), { fileName,
            data });
    };
    loglevel_1.default.info(`Starting upload of ${allFileNames.length} files to ${storageAccount} with concurrency ${concurrent}`);
    const progress = new cli_progress_1.default.SingleBar({
        format: "Upload Progress | {bar} | {percentage}% || {value}/{total} Files",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
    });
    progress.start(allFileNames.length, 0);
    (0, rxjs_1.from)(chunks)
        .pipe((0, rxjs_1.map)((indivChunk) => {
        return indivChunk.map((index) => appendFileToItem(fileData[index]));
    }), (0, rxjs_1.mergeMap)(async (items) => {
        const fd = new form_data_1.default();
        for (const item of items) {
            fd.append("file", item.data, {
                contentType: item.contentType,
                filename: item.fileName,
            });
        }
        const msg = `Shadow Drive Signed Message:\nStorage Account: ${storageAccount}\nUpload files with hash: ${fileNamesHashed}`;
        const signature = (0, helpers_1.signMessage)(msg, keypair);
        fd.append("message", signature);
        fd.append("signer", keypair.publicKey.toString());
        fd.append("storage_account", storageAccount);
        fd.append("fileNames", allFileNames.toString());
        const response = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/upload`, {
            method: "POST",
            body: fd,
        });
        if (!response.ok) {
            const error = (await response.json()).error;
            loglevel_1.default.info("Error processing transaction. See below for details:");
            loglevel_1.default.error(`Server response status code: ${response.status}`);
            loglevel_1.default.error(`Server response status message: ${error}`);
            return items.map((item) => ({
                fileName: item.fileName,
                status: `Not uploaded: ${error}`,
                location: null,
            }));
        }
        else {
            const responseJson = await response.json();
            if (responseJson.upload_errors.length) {
                responseJson.upload_errors.map((error) => {
                    existingUploadJSON.push({
                        fileName: error.file,
                        status: `Not uploaded: ${error.error}`,
                        location: null,
                    });
                });
            }
            loglevel_1.default.debug(responseJson);
            loglevel_1.default.debug(`Message signature: ${responseJson.message}`);
            return items.map((item) => ({
                fileName: item.fileName,
                status: "Uploaded.",
                location: item.url,
            }));
        }
    }, concurrent), (0, rxjs_1.tap)((res) => progress.increment(res.length)), (0, rxjs_1.toArray)(), (0, rxjs_1.map)((res) => res.flat()))
        .subscribe((results) => {
        fs.writeFileSync(logPath, JSON.stringify(results));
        progress.stop();
        loglevel_1.default.info(`${results.length} files uploaded.`);
    });
}
programCommand("upload-multiple-files")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that will upload the files")
    .requiredOption("-d, --directory <string>", "Path to folder of files you want to upload.")
    .option("-s, --storage-account <string>", "Storage account to upload file to.")
    .option("-c, --concurrent <number>", "Number of concurrent batch uploads.", "3")
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
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
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
    loglevel_1.default.debug({ fileDataResponse });
    if (fileDataResponse.error ||
        !fileDataResponse.file_data["owner-account-pubkey"]) {
        return loglevel_1.default.error("File does not exist");
    }
    loglevel_1.default.info(`Retreiving the storage account associated with the file ${options.url}`);
    const fileOwnerOnChain = new anchor.web3.PublicKey(fileDataResponse.file_data["owner-account-pubkey"]);
    if (fileOwnerOnChain.toBase58() != keypair.publicKey.toBase58()) {
        return loglevel_1.default.error("Permission denied: Not file owner");
    }
    const storageAccount = new anchor.web3.PublicKey(fileDataResponse.file_data["storage-account-pubkey"]);
    const storageAccountType = await (0, helpers_1.validateStorageAccount)(storageAccount, connection);
    if (!storageAccountType || storageAccountType === null) {
        return loglevel_1.default.error(`Storage account ${storageAccount.toString()} is not a valid Shadow Drive Storage Account.`);
    }
    let storageAccountOnChain;
    if (storageAccountType === "V1") {
        storageAccountOnChain =
            await programClient.account.storageAccount.fetch(storageAccount);
    }
    if (storageAccountType === "V2") {
        storageAccountOnChain =
            await programClient.account.storageAccountV2.fetch(storageAccount);
    }
    loglevel_1.default.debug({ storageAccountOnChain });
    let storageAccountOwner = new anchor.web3.PublicKey(storageAccountOnChain.owner1);
    if (!storageAccountOwner.equals(keypair.publicKey)) {
        loglevel_1.default.error("Permission denied: Not file owner");
    }
    const msg = `Shadow Drive Signed Message:\nStorageAccount: ${storageAccount.toString()}\nFile to delete: ${options.url}`;
    const signature = (0, helpers_1.signMessage)(msg, keypair);
    try {
        loglevel_1.default.info(`Sending file delete request to cluster for file ${options.url}...`);
        const deleteRequestBody = {
            signer: keypair.publicKey.toString(),
            message: signature,
            location: options.url,
        };
        const deleteRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/delete-file`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(deleteRequestBody),
        });
        const deleteResponse = await deleteRequest.json();
    }
    catch (e) {
        loglevel_1.default.error("Error with request");
        loglevel_1.default.error(e);
    }
    return loglevel_1.default.info(`File ${options.url} successfully deleted`);
});
programCommand("get-storage-account")
    .requiredOption("-kp, --keypair <string>", "Path to the keypair file for the wallet that you want to find storage accounts for.")
    .action(async (options, cmd) => {
    var _a;
    const keypair = (0, helpers_1.loadWalletKey)(path.resolve(options.keypair));
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
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
    let storageAccounts = await Promise.all(accountsToFetch.map(async (account) => {
        const storageAccountDetails = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/storage-account-info`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                storage_account: account.toString(),
            }),
        });
        const storageAccountDetailsJson = await storageAccountDetails.json();
        return storageAccountDetailsJson;
    }));
    storageAccounts = storageAccounts.filter((account) => {
        if (typeof account.identifier === "undefined" ||
            account.identifier === null) {
            return false;
        }
        else {
            return true;
        }
    });
    if (!storageAccounts.length) {
        return loglevel_1.default.error("There are no active storage accounts for this wallet.");
    }
    let formattedAccounts = storageAccounts.map((account) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes - account.current_usage)
                : null,
            owner1: account === null || account === void 0 ? void 0 : account.owner1,
            creationTime: account === null || account === void 0 ? void 0 : account.creation_time,
            creationEpoch: account === null || account === void 0 ? void 0 : account.creation_epoch,
            pubkey: (account === null || account === void 0 ? void 0 : account.identifier)
                ? new anchor.web3.PublicKey(account.storage_account)
                : null,
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.to_be_deleted : null,
            immutable: (account === null || account === void 0 ? void 0 : account.identifier) ? account.immutable : null,
            version: (account === null || account === void 0 ? void 0 : account.identifier) ? account.version : null,
            accountCounterSeed: (account === null || account === void 0 ? void 0 : account.identifier)
                ? account.account_counter_seed
                : null,
        };
    });
    formattedAccounts = formattedAccounts.sort((0, helpers_1.sortByProperty)("accountCounterSeed"));
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to get?",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining`,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to get.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option];
    loglevel_1.default.info(`Information for storage account ${storageAccount.identifier} - ${(_a = storageAccount.pubkey) === null || _a === void 0 ? void 0 : _a.toString()}:`);
    return loglevel_1.default.info(storageAccount);
});
programCommand("delete-storage-account")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that owns the storage account")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
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
    let accounts = [];
    await Promise.all(accountsToFetch.map(async (account) => {
        const storageAccountDetails = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/storage-account-info`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                storage_account: account.toString(),
            }),
        });
        const storageAccountDetailsJson = await storageAccountDetails.json();
        if (storageAccountDetailsJson.identifier !== null &&
            typeof storageAccountDetailsJson.identifier !== "undefined") {
            accounts.push(storageAccountDetailsJson);
        }
        return storageAccountDetailsJson;
    }));
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes, true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes - account.current_usage, true, 2)
                : null,
            pubkey: (account === null || account === void 0 ? void 0 : account.identifier)
                ? new anchor.web3.PublicKey(account.storage_account)
                : null,
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.to_be_deleted : null,
            immutable: (account === null || account === void 0 ? void 0 : account.identifier) ? account.immutable : null,
            version: (account === null || account === void 0 ? void 0 : account.identifier) ? account.version : null,
            accountCounterSeed: (account === null || account === void 0 ? void 0 : account.identifier)
                ? account.account_counter_seed
                : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    formattedAccounts = formattedAccounts.sort((0, helpers_1.sortByProperty)("accountCounterSeed"));
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to delete?",
        warn: "Account is marked immutable or is already requested to be deleted",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining - ${acc.immutable ? "Immutable" : "Mutable"}`,
                disabled: acc.immutable || acc.toBeDeleted,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to add storage to.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const storageAccountData = formattedAccounts[pickedAccount.option];
    const storageAccountType = await (0, helpers_1.validateStorageAccount)(storageAccount, connection);
    if (!storageAccountType || storageAccountType === null) {
        return loglevel_1.default.error(`Storage account ${storageAccount.toString()} is not a valid Shadow Drive Storage Account.`);
    }
    loglevel_1.default.debug({
        storageAccount: storageAccount.toString(),
    });
    const txnSpinner = (0, ora_1.default)("Sending storage account deletion request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        if (storageAccountType === "V1") {
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
        if (storageAccountType === "V2") {
            const transaction = await programClient.methods
                .requestDeleteAccount2()
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
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
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
    let accounts = [];
    await Promise.all(accountsToFetch.map(async (account) => {
        const storageAccountDetails = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/storage-account-info`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                storage_account: account.toString(),
            }),
        });
        const storageAccountDetailsJson = await storageAccountDetails.json();
        if (storageAccountDetailsJson.identifier !== null &&
            typeof storageAccountDetailsJson.identifier !== "undefined") {
            accounts.push(storageAccountDetailsJson);
        }
        return storageAccountDetailsJson;
    }));
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes, true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes - account.current_usage, true, 2)
                : null,
            pubkey: (account === null || account === void 0 ? void 0 : account.identifier)
                ? new anchor.web3.PublicKey(account.storage_account)
                : null,
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.to_be_deleted : null,
            immutable: (account === null || account === void 0 ? void 0 : account.identifier) ? account.immutable : null,
            version: (account === null || account === void 0 ? void 0 : account.identifier) ? account.version : null,
            accountCounterSeed: (account === null || account === void 0 ? void 0 : account.identifier)
                ? account.account_counter_seed
                : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    formattedAccounts = formattedAccounts.sort((0, helpers_1.sortByProperty)("accountCounterSeed"));
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to unmark for deletion?",
        warn: "Account not marked for deletion",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining`,
                disabled: !acc.toBeDeleted,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to unmark for deletion.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const storageAccountType = await (0, helpers_1.validateStorageAccount)(storageAccount, connection);
    if (!storageAccountType || storageAccountType === null) {
        return loglevel_1.default.error(`Storage account ${storageAccount.toString()} is not a valid Shadow Drive Storage Account.`);
    }
    const [stakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
    loglevel_1.default.debug({
        storageAccount: storageAccount.toString(),
    });
    const txnSpinner = (0, ora_1.default)("Sending storage account undelete request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        if (storageAccountType === "V1") {
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
        if (storageAccountType === "V2") {
            const transaction = await programClient.methods
                .unmarkDeleteAccount2()
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
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
    let [storageConfig, storageConfigBump] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    const emissionsAta = await (0, helpers_1.findAssociatedTokenAddress)(emissionsPubkey, tokenMint);
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
    let accounts = [];
    await Promise.all(accountsToFetch.map(async (account) => {
        const storageAccountDetails = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/storage-account-info`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                storage_account: account.toString(),
            }),
        });
        const storageAccountDetailsJson = await storageAccountDetails.json();
        if (storageAccountDetailsJson.identifier !== null &&
            typeof storageAccountDetailsJson.identifier !== "undefined") {
            accounts.push(storageAccountDetailsJson);
        }
        return storageAccountDetailsJson;
    }));
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes, true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes - account.current_usage, true, 2)
                : null,
            pubkey: (account === null || account === void 0 ? void 0 : account.identifier)
                ? new anchor.web3.PublicKey(account.storage_account)
                : null,
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.to_be_deleted : null,
            immutable: (account === null || account === void 0 ? void 0 : account.identifier) ? account.immutable : null,
            version: (account === null || account === void 0 ? void 0 : account.identifier) ? account.version : null,
            accountCounterSeed: (account === null || account === void 0 ? void 0 : account.identifier)
                ? account.account_counter_seed
                : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    formattedAccounts = formattedAccounts.sort((0, helpers_1.sortByProperty)("accountCounterSeed"));
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to add storage to?",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.totalStorage} reserved - ${acc.storageAvailable} remaining - ${acc.immutable ? "Immutable" : "Mutable"}`,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to add storage to.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    let accountType = await (0, helpers_1.validateStorageAccount)(new web3_js_1.PublicKey(storageAccount), connection);
    if (!accountType || accountType === null) {
        return loglevel_1.default.error(`Storage account ${storageAccount} is not a valid Shadow Drive Storage Account.`);
    }
    const storageAccountData = formattedAccounts[pickedAccount.option];
    const [stakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
    const ownerAta = await (0, helpers_1.findAssociatedTokenAddress)(keypair.publicKey, tokenMint);
    loglevel_1.default.debug({
        storageAccount: storageAccount.toString(),
        stakeAccount: stakeAccount.toString(),
        ownerAta: ownerAta.toString(),
    });
    const txnSpinner = (0, ora_1.default)("Sending add storage request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        if (accountType === "V1" && !storageAccountData.immutable) {
            const transaction = await programClient.methods
                .increaseStorage(new anchor.BN(storageInputAsBytes.toString()))
                .accounts({
                storageConfig,
                storageAccount,
                owner: keypair.publicKey,
                ownerAta,
                stakeAccount,
                tokenMint: tokenMint,
                uploader: uploaderPubkey,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            })
                .transaction();
            transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
            transaction.feePayer = keypair.publicKey;
            transaction.partialSign(keypair);
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
            });
            const addStorageRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/add-storage`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    transaction: Buffer.from(serializedTransaction.toJSON().data).toString("base64"),
                    commitment: "finalized",
                }),
            });
            if (!addStorageRequest.ok) {
                txnSpinner.fail("Error processing transaction. See below for details:");
                loglevel_1.default.error(`Server response status code: ${addStorageRequest.status}`);
                loglevel_1.default.error(`Server response status message: ${(await addStorageRequest.json()).error}`);
                return;
            }
            const responseJson = await addStorageRequest.json();
            loglevel_1.default.debug(responseJson);
        }
        if (accountType === "V1" && storageAccountData.immutable) {
            const transaction = await programClient.methods
                .increaseImmutableStorage(new anchor.BN(storageInputAsBytes.toString()))
                .accounts({
                storageConfig,
                storageAccount,
                owner: keypair.publicKey,
                ownerAta,
                tokenMint: tokenMint,
                uploader: uploaderPubkey,
                emissionsWallet: emissionsAta,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            })
                .transaction();
            transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
            transaction.feePayer = keypair.publicKey;
            transaction.partialSign(keypair);
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
            });
            const addStorageRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/add-storage`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    transaction: Buffer.from(serializedTransaction.toJSON().data).toString("base64"),
                    commitment: "finalized",
                }),
            });
            if (!addStorageRequest.ok) {
                txnSpinner.fail("Error processing transaction. See below for details:");
                loglevel_1.default.error(`Server response status code: ${addStorageRequest.status}`);
                loglevel_1.default.error(`Server response status message: ${(await addStorageRequest.json()).error}`);
                return;
            }
            const responseJson = await addStorageRequest.json();
            loglevel_1.default.debug(responseJson);
        }
        if (accountType === "V2" && !storageAccountData.immutable) {
            const transaction = await programClient.methods
                .increaseStorage2(new anchor.BN(storageInputAsBytes.toString()))
                .accounts({
                storageConfig,
                storageAccount,
                owner: keypair.publicKey,
                ownerAta,
                stakeAccount,
                tokenMint: tokenMint,
                uploader: uploaderPubkey,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            })
                .transaction();
            transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
            transaction.feePayer = keypair.publicKey;
            transaction.partialSign(keypair);
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
            });
            const addStorageRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/add-storage`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    transaction: Buffer.from(serializedTransaction.toJSON().data).toString("base64"),
                    commitment: "finalized",
                }),
            });
            if (!addStorageRequest.ok) {
                txnSpinner.fail("Error processing transaction. See below for details:");
                loglevel_1.default.error(`Server response status code: ${addStorageRequest.status}`);
                loglevel_1.default.error(`Server response status message: ${(await addStorageRequest.json()).error}`);
                return;
            }
            const responseJson = await addStorageRequest.json();
            loglevel_1.default.debug(responseJson);
        }
        if (accountType === "V2" && storageAccountData.immutable) {
            const transaction = await programClient.methods
                .increaseImmutableStorage2(new anchor.BN(storageInputAsBytes.toString()))
                .accounts({
                storageConfig,
                storageAccount,
                owner: keypair.publicKey,
                ownerAta,
                tokenMint: tokenMint,
                uploader: uploaderPubkey,
                emissionsWallet: emissionsAta,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            })
                .transaction();
            transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
            transaction.feePayer = keypair.publicKey;
            transaction.partialSign(keypair);
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
            });
            const addStorageRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/add-storage`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    transaction: Buffer.from(serializedTransaction.toJSON().data).toString("base64"),
                    commitment: "finalized",
                }),
            });
            if (!addStorageRequest.ok) {
                txnSpinner.fail("Error processing transaction. See below for details:");
                loglevel_1.default.error(`Server response status code: ${addStorageRequest.status}`);
                loglevel_1.default.error(`Server response status message: ${(await addStorageRequest.json()).error}`);
                return;
            }
            const responseJson = await addStorageRequest.json();
            loglevel_1.default.debug(responseJson);
        }
    }
    catch (e) {
        txnSpinner.fail("Error sending transaction. Please see information below.");
        return loglevel_1.default.error(e);
    }
    txnSpinner.succeed(`Storage account capacity successfully increased`);
    return;
});
programCommand("reduce-storage")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that will upload the files")
    .requiredOption("-s, --size <string>", "Amount of storage you are requesting to remove from your storage account. Should be in a string like '1KB', '1MB', '1GB'. Only KB, MB, and GB storage delineations are supported currently.")
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
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
    let [storageConfig] = await (0, helpers_1.getStorageConfigPDA)(programClient);
    let [userInfo] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("user-info"), keypair.publicKey.toBytes()], programClient.programId);
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
    let accounts = [];
    await Promise.all(accountsToFetch.map(async (account) => {
        const storageAccountDetails = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/storage-account-info`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                storage_account: account.toString(),
            }),
        });
        const storageAccountDetailsJson = await storageAccountDetails.json();
        if (storageAccountDetailsJson.identifier !== null &&
            typeof storageAccountDetailsJson.identifier !== "undefined") {
            accounts.push(storageAccountDetailsJson);
        }
        return storageAccountDetailsJson;
    }));
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes, true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes - account.current_usage, true, 2)
                : null,
            pubkey: (account === null || account === void 0 ? void 0 : account.identifier)
                ? new anchor.web3.PublicKey(account.storage_account)
                : null,
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.to_be_deleted : null,
            immutable: (account === null || account === void 0 ? void 0 : account.identifier) ? account.immutable : null,
            version: (account === null || account === void 0 ? void 0 : account.identifier) ? account.version : null,
            accountCounterSeed: (account === null || account === void 0 ? void 0 : account.identifier)
                ? account.account_counter_seed
                : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    formattedAccounts = formattedAccounts.sort((0, helpers_1.sortByProperty)("accountCounterSeed"));
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to remove storage from?",
        warn: "Account is marked for deletion or is immutable.",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.totalStorage} reserved - ${acc.storageAvailable} remaining - ${acc.immutable ? "Immutable" : "Mutable"}`,
                disabled: acc.toBeDeleted || acc.immutable,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to remove storage from.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const storageAccountType = await (0, helpers_1.validateStorageAccount)(storageAccount, connection);
    if (!storageAccountType || storageAccountType === null) {
        return loglevel_1.default.error(`Storage account ${storageAccount.toString()} is not a valid Shadow Drive Storage Account.`);
    }
    const [stakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
    const ownerAta = await (0, helpers_1.findAssociatedTokenAddress)(keypair.publicKey, tokenMint);
    const [unstakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("unstake-account"), storageAccount.toBytes()], programClient.programId);
    const [unstakeInfo] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("unstake-info"), storageAccount.toBytes()], programClient.programId);
    const emissionsAta = await (0, helpers_1.findAssociatedTokenAddress)(emissionsPubkey, tokenMint);
    loglevel_1.default.debug({
        storageAccount: storageAccount.toString(),
        stakeAccount: stakeAccount.toString(),
        ownerAta: ownerAta.toString(),
    });
    const txnSpinner = (0, ora_1.default)("Sending reduce storage request. Subject to solana traffic conditions (w/ 120s timeout).").start();
    try {
        if (storageAccountType === "V1") {
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
                uploader: uploaderPubkey,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
                .transaction();
            transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
            transaction.feePayer = keypair.publicKey;
            transaction.partialSign(keypair);
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
            });
            const addStorageRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/reduce-storage`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    transaction: Buffer.from(serializedTransaction.toJSON().data).toString("base64"),
                    commitment: "finalized",
                }),
            });
            if (!addStorageRequest.ok) {
                txnSpinner.fail("Error processing transaction. See below for details:");
                loglevel_1.default.error(`Server response status code: ${addStorageRequest.status}`);
                loglevel_1.default.error(`Server response status message: ${(await addStorageRequest.json()).error}`);
                return;
            }
            const responseJson = await addStorageRequest.json();
            loglevel_1.default.debug(responseJson);
        }
        if (storageAccountType === "V2") {
            const transaction = await programClient.methods
                .decreaseStorage2(new anchor.BN(storageInputAsBytes.toString()))
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
                uploader: uploaderPubkey,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
                .transaction();
            transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
            transaction.feePayer = keypair.publicKey;
            transaction.partialSign(keypair);
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
            });
            const addStorageRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/reduce-storage`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    transaction: Buffer.from(serializedTransaction.toJSON().data).toString("base64"),
                    commitment: "finalized",
                }),
            });
            if (!addStorageRequest.ok) {
                txnSpinner.fail("Error processing transaction. See below for details:");
                loglevel_1.default.error(`Server response status code: ${addStorageRequest.status}`);
                loglevel_1.default.error(`Server response status message: ${(await addStorageRequest.json()).error}`);
                return;
            }
            const responseJson = await addStorageRequest.json();
            loglevel_1.default.debug(responseJson);
        }
    }
    catch (e) {
        txnSpinner.fail("Error sending transaction. Please see information below.");
        return loglevel_1.default.error(e);
    }
    txnSpinner.succeed(`Storage account capacity successfully reduced.`);
    return;
});
programCommand("make-storage-account-immutable")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that you want to make immutable")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
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
    let accounts = [];
    await Promise.all(accountsToFetch.map(async (account) => {
        const storageAccountDetails = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/storage-account-info`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                storage_account: account.toString(),
            }),
        });
        const storageAccountDetailsJson = await storageAccountDetails.json();
        if (storageAccountDetailsJson.identifier !== null &&
            typeof storageAccountDetailsJson.identifier !== "undefined") {
            accounts.push(storageAccountDetailsJson);
        }
        return storageAccountDetailsJson;
    }));
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes, true, 2)
                : null,
            pubkey: (account === null || account === void 0 ? void 0 : account.identifier)
                ? new anchor.web3.PublicKey(account.storage_account)
                : null,
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.to_be_deleted : null,
            immutable: (account === null || account === void 0 ? void 0 : account.identifier) ? account.immutable : null,
            version: (account === null || account === void 0 ? void 0 : account.identifier) ? account.version : null,
            accountCounterSeed: (account === null || account === void 0 ? void 0 : account.identifier)
                ? account.account_counter_seed
                : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier) {
            return acc;
        }
    });
    formattedAccounts = formattedAccounts.sort((0, helpers_1.sortByProperty)("accountCounterSeed"));
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to make immutable?",
        warn: "Account already immutable",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.totalStorage} reserved. ${acc.immutable ? "Immutable" : "Mutable"}`,
                disabled: acc.immutable,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to make immutable.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const storageAccountType = await (0, helpers_1.validateStorageAccount)(storageAccount, connection);
    if (!storageAccountType || storageAccountType === null) {
        return loglevel_1.default.error(`Storage account ${storageAccount.toString()} is not a valid Shadow Drive Storage Account.`);
    }
    const [stakeAccount] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("stake-account"), storageAccount.toBytes()], programClient.programId);
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
        if (storageAccountType === "V1") {
            const transaction = await programClient.methods
                .makeAccountImmutable()
                .accounts({
                storageConfig,
                storageAccount,
                owner: keypair.publicKey,
                ownerAta,
                stakeAccount,
                uploader: uploaderPubkey,
                emissionsWallet: emissionsAta,
                tokenMint: tokenMint,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
            })
                .transaction();
            transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
            transaction.feePayer = keypair.publicKey;
            transaction.partialSign(keypair);
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
            });
            const makeImmutableRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/make-immutable`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    transaction: Buffer.from(serializedTransaction.toJSON().data).toString("base64"),
                    commitment: "finalized",
                }),
            });
            if (!makeImmutableRequest.ok) {
                txnSpinner.fail("Error processing transaction. See below for details:");
                loglevel_1.default.error(`Server response status code: ${makeImmutableRequest.status}`);
                loglevel_1.default.error(`Server response status message: ${(await makeImmutableRequest.json()).error}`);
                return;
            }
            const responseJson = await makeImmutableRequest.json();
            loglevel_1.default.debug(responseJson);
        }
        if (storageAccountType === "V2") {
            const transaction = await programClient.methods
                .makeAccountImmutable2()
                .accounts({
                storageConfig,
                storageAccount,
                owner: keypair.publicKey,
                ownerAta,
                stakeAccount,
                uploader: uploaderPubkey,
                emissionsWallet: emissionsAta,
                tokenMint: tokenMint,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
            })
                .transaction();
            transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
            transaction.feePayer = keypair.publicKey;
            transaction.partialSign(keypair);
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
            });
            const makeImmutableRequest = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/make-immutable`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    transaction: Buffer.from(serializedTransaction.toJSON().data).toString("base64"),
                    commitment: "finalized",
                }),
            });
            if (!makeImmutableRequest.ok) {
                txnSpinner.fail("Error processing transaction. See below for details:");
                loglevel_1.default.error(`Server response status code: ${makeImmutableRequest.status}`);
                loglevel_1.default.error(`Server response status message: ${(await makeImmutableRequest.json()).error}`);
                return;
            }
            const responseJson = await makeImmutableRequest.json();
            loglevel_1.default.debug(responseJson);
        }
    }
    catch (e) {
        txnSpinner.fail("Error sending transaction. Please see information below.");
        return loglevel_1.default.error(e);
    }
    txnSpinner.succeed(`Storage account ${storageAccount.toString()} has been marked as immutable. Files can no longer be deleted from this storage account.`);
});
programCommand("claim-stake")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that owns the storage account you want to claim available stake from.")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
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
    let accounts = await (await programClient.account.storageAccountV2.fetchMultiple(accountsToFetch))
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
programCommand("redeem-file-account-rent")
    .requiredOption("-kp, --keypair <string>", "Path to wallet that owns the storage account you want to claim available stake from.")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
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
    let accounts = [];
    await Promise.all(accountsToFetch.map(async (account) => {
        const storageAccountDetails = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/storage-account-info`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                storage_account: account.toString(),
            }),
        });
        const storageAccountDetailsJson = await storageAccountDetails.json();
        if (storageAccountDetailsJson.identifier !== null &&
            typeof storageAccountDetailsJson.identifier !== "undefined") {
            accounts.push(storageAccountDetailsJson);
        }
        return storageAccountDetailsJson;
    }));
    let alist1 = accounts.map((account, idx) => {
        return {
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes, true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes - account.current_usage, true, 2)
                : null,
            pubkey: (account === null || account === void 0 ? void 0 : account.identifier)
                ? new anchor.web3.PublicKey(account.storage_account)
                : null,
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.to_be_deleted : null,
            immutable: (account === null || account === void 0 ? void 0 : account.identifier) ? account.immutable : null,
            version: (account === null || account === void 0 ? void 0 : account.identifier) ? account.version : null,
            accountCounterSeed: (account === null || account === void 0 ? void 0 : account.identifier)
                ? account.account_counter_seed
                : null,
        };
    });
    let formattedAccounts = alist1.filter((acc, idx) => {
        if (acc.identifier && acc.version === "V1") {
            return acc;
        }
    });
    formattedAccounts = formattedAccounts.sort((0, helpers_1.sortByProperty)("accountCounterSeed"));
    const pickedAccount = await (0, prompts_1.default)({
        type: "select",
        name: "option",
        message: "Which storage account do you want to redeem all file rent from?",
        choices: formattedAccounts.map((acc) => {
            return {
                title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} remaining`,
            };
        }),
    });
    if (typeof pickedAccount.option === "undefined") {
        loglevel_1.default.error("You must pick a storage account to redeem file rent from.");
        return;
    }
    const storageAccount = formattedAccounts[pickedAccount.option].pubkey;
    const agrees = await (0, prompts_1.default)({
        type: "confirm",
        name: "confirm",
        message: `Warning: this will delete all on-chain file accounts associated with the storage account ${storageAccount.toString()} in order to reclaim the SOL rent. Your data/files will not be removed from Shadow Drive.`,
        initial: false,
    });
    if (!agrees.confirm) {
        return loglevel_1.default.error("You must confirm before moving forward.");
    }
    const onchainStorageAccountInfo = await programClient.account.storageAccount.fetch(storageAccount);
    const numberOfFiles = onchainStorageAccountInfo.initCounter;
    let filePubkeys = [];
    for (let i = 0; i < numberOfFiles; i++) {
        const fileSeed = new anchor.BN(i);
        let [file] = anchor.web3.PublicKey.findProgramAddressSync([
            storageAccount.toBytes(),
            fileSeed.toTwos(64).toArrayLike(Buffer, "le", 4),
        ], programClient.programId);
        let fileAccountInfo = await connection.getAccountInfo(file);
        if (fileAccountInfo) {
            filePubkeys.push(file);
        }
    }
    const progress = new cli_progress_1.default.SingleBar({
        format: "Progress | {bar} | {percentage}% || {value}/{total} file accounts closed",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
    });
    progress.start(filePubkeys.length, 0);
    await Promise.all(filePubkeys.map(async (pubkey) => {
        try {
            await programClient.methods
                .redeemRent()
                .accounts({
                storageAccount,
                file: pubkey,
                owner: keypair.publicKey,
            })
                .signers([keypair])
                .rpc({ commitment: "processed" });
            progress.increment(1);
        }
        catch (e) {
            loglevel_1.default.error("Error with transaction, see below for details");
            loglevel_1.default.error(e);
        }
    }));
    progress.stop();
    loglevel_1.default.info(`Successfully reclaimed rent from all file accounts in storage account ${storageAccount.toString()}`);
});
programCommand("show-files")
    .requiredOption("-kp, --keypair <string>", "Path to the keypair file for the wallet you would like to find storage accounts for.")
    .action(async (options, cmd) => {
    const keypair = (0, helpers_1.loadWalletKey)(options.keypair);
    const connection = new anchor.web3.Connection(options.rpc);
    const [programClient, provider] = (0, helpers_1.getAnchorEnvironment)(keypair, connection);
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
    let accounts = [];
    await Promise.all(accountsToFetch.map(async (account) => {
        const storageAccountDetails = await (0, node_fetch_1.default)(`${constants_1.SHDW_DRIVE_ENDPOINT}/storage-account-info`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body:
             JSON.stringify({
                 storage_account: account.toString(),
             }),
        });
        const storageAccountDetailsJson = await storageAccountDetails.json();
        if (storageAccountDetailsJson.identifier !== null &&
            typeof storageAccountDetailsJson.identifier !== "undefined") {
            accounts.push(storageAccountDetailsJson);
        }
        return storageAccountDetailsJson;
    }));
    let alist1 = accounts.map((account, idx) => {
        return{
            identifier: account === null || account === void 0 ? void 0 : account.identifier,
            totalStorage: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes, true, 2)
                : null,
            storageAvailable: (account === null || account === void 0 ? void 0 : account.identifier)
                ? (0, helpers_1.bytesToHuman)(account.reserved_bytes - account.current_usage, true, 2)
                : null,
            pubkey: (account === null || account === void 0 ? void 0 : account.identifier)
                ? new anchor.web3.PublicKey(account.storage_account)
                : null,
            toBeDeleted: (account === null || account === void 0 ? void 0 : account.identifier) ? account.to_be_deleted : null,
            immutable: (account === null || account === void 0 ? void 0 : account.identifier) ? account.immutable : null,
            version: (account === null || account === void 0 ? void 0 : account.identifier) ? account.version : null,
            accountCounterSeed: (account === null || account === void 0 ? void 0 : account.identifier)
                ? account.account_counter_seed
                : null,
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
            message: "Which storage account do you want to see the contents of?\n",
            warn: "This account is marked for deletion",
            choices: formattedAccounts.map((acc) => {
                return{
                    title: `${acc.identifier} - ${acc.pubkey.toString()} - ${acc.storageAvailable} available - ${acc.version}`,
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
    if (!allObjectsRequest.status) {
        loglevel_1.default.error("Error getting a list of existing files. See details below and try your batch upload request again.");
        loglevel_1.default.error(`Response status: ${allObjectsRequest.status}`);
        loglevel_1.default.error(`Response message: ${(await allObjectsRequest.json()).error}`);
        return;
    }
    const allObjects = await allObjectsRequest.json();
    const files =[];
    for (const file of allObjects.keys) {
        const fileUrl = `https://shdw-drive.genesysgo.net/${storageAccount.toString()}/${file}`;
        const fileData = await (0, node_fetch_1.default)(fileUrl, {
            method: "GET",
            headers: {
            },
        });
        const fileSize = (0, helpers_1.bytesToHuman)(fileData.headers.get("Content-Length"));
        files.push({file: file,
                    size: fileSize});
    }
    function repeateString(string, times) {
        if (times < 0) {
            return "";
        }
        if (times === 0) {
            return string;
        }
        else {
            return string + repeateString(string, times - 1);
        }
    }
    fileSpinner.succeed("\n-------Found the following files-------\n");
    for (let i = 0; i < files.length; i++) {
        loglevel_1.default.info(`${files[i].file}${repeateString(".", 42 - files[i].file.length)}${files[i].size}`);
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