import { setupTabUpdates } from "./maze-utils/tab-updates";
import { setupBackgroundRequestProxy } from "./maze-utils/background-request-proxy";
import { generateUserID } from "./maze-utils/setup";
import Config from "./config/config";
import { isSafari } from "./maze-utils/config";
import * as CompileConfig from "../config.json";
import { isFirefoxOrSafari } from "./maze-utils";

setupTabUpdates(Config);
setupBackgroundRequestProxy();

chrome.runtime.onMessage.addListener((request) =>  {
    switch(request.message) {
        case "openConfig":
            void chrome.tabs.create({url: chrome.runtime.getURL('options/options.html' + (request.hash ? '#' + request.hash : ''))});
            return false;
        case "openHelp":
            void chrome.tabs.create({url: chrome.runtime.getURL('help.html')});
            return false;
    }

    return false;
});

chrome.runtime.onInstalled.addListener(() => {
    // This let's the config sync to run fully before checking.
    // This is required on Firefox
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setTimeout(async () => {
        const userID = Config.config!.userID;

        // If there is no userID, then it is the first install.
        if (!userID){
            // First check for config from SponsorBlock extension
            const sponsorBlockConfig = await Promise.race([
                new Promise((resolve) => setTimeout(resolve, 1000)),
                new Promise((resolve) => {
                    const extensionIds = getExtensionIdsToImportFrom();
                    
                    for (const id of extensionIds) {
                        chrome.runtime.sendMessage(id, { message: "requestConfig" }, (response) => {
                            if (response) {
                                resolve(response);
                            }
                        });
                    }
                })
            ]);

            if (sponsorBlockConfig) {
                Config.config!.userID = sponsorBlockConfig["userID"];
                Config.config!.allowExpirements = sponsorBlockConfig["allowExpirements"];
                Config.config!.showDonationLink = sponsorBlockConfig["showDonationLink"];
                Config.config!.showUpsells = sponsorBlockConfig["showUpsells"];
                Config.config!.darkMode = sponsorBlockConfig["darkMode"];
                Config.config!.importedConfig = true;
            } else {
                const newUserID = generateUserID();
                Config.config!.userID = newUserID;
            }

            Config.config!.showInfoAboutRandomThumbnails = true;

            // Open up the install page
            setTimeout(() => void chrome.tabs.create({url: chrome.runtime.getURL("/help.html")}), 100);
        }
    }, 1500);
});

function getExtensionIdsToImportFrom(): string[] {
    if (isSafari()) {
        return CompileConfig.extensionImportList.safari;
    } else if (isFirefoxOrSafari()) {
        return CompileConfig.extensionImportList.firefox;
    } else {
        return CompileConfig.extensionImportList.chromium;
    }
}

chrome.runtime.onMessageExternal.addListener((request, sender, callback) => {
    if (sender.id && getExtensionIdsToImportFrom().includes(sender.id)) {
        if (request.message === "isInstalled") {
            callback(true);
        }
    }
});