import { VideoID, getVideoID } from "../maze-utils/video";
import Config from "../config/config";
import { getVideoTitleIncludingUnsubmitted } from "../dataFetching";
import { logError } from "../utils/logger";
import { getOrCreateTitleButtonContainer } from "../utils/titleBar";
import { BrandingLocation, extractVideoIDFromElement, toggleShowCustom } from "../videoBranding/videoBranding";
import { formatTitle } from "./titleFormatter";
import { setPageTitle } from "./pageTitleHandler";
import { shouldReplaceTitles, shouldReplaceTitlesFastCheck } from "../config/channelOverrides";
import { countTitleReplacement } from "../config/stats";
import { isReduxInstalled } from "../utils/extensionCompatibility";

enum WatchPageType {
    Video,
    Miniplayer
}

let lastWatchTitle = "";
let lastWatchVideoID: VideoID | null = null;
let lastUrlWatchPageType: WatchPageType | null = null;

export async function replaceTitle(element: HTMLElement, videoID: VideoID, showCustomBranding: boolean, brandingLocation: BrandingLocation): Promise<boolean> {
    const originalTitleElement = getOriginalTitleElement(element, brandingLocation);

    if (!Config.config!.extensionEnabled || shouldReplaceTitlesFastCheck(videoID) === false) {
        showOriginalTitle(element, brandingLocation);
        return false;
    }
    
    if (brandingLocation === BrandingLocation.Watch) {
        const currentWatchPageType = document.URL.includes("watch") ? WatchPageType.Video : WatchPageType.Miniplayer;

        if (lastWatchVideoID && originalTitleElement?.textContent 
                && videoID !== lastWatchVideoID && originalTitleElement.textContent === lastWatchTitle
                && lastUrlWatchPageType === currentWatchPageType) {
            // Don't reset it if it hasn't changed videos yet, will be handled by title change listener
            return false;
        }

        lastWatchTitle = originalTitleElement?.textContent ?? "";
        lastWatchVideoID = videoID;
        lastUrlWatchPageType = currentWatchPageType;
    }

    //todo: add an option to not hide title
    hideCustomTitle(element, brandingLocation);
    hideOriginalTitle(element, brandingLocation);

    try {
        const titleData = await getVideoTitleIncludingUnsubmitted(videoID, brandingLocation);
        if (!await isOnCorrectVideo(element, brandingLocation, videoID)) return false;

        const title = titleData?.title;
        if (title) {
            const formattedTitle = await formatTitle(title, !titleData.original, videoID);
            if (!await isOnCorrectVideo(element, brandingLocation, videoID)) return false;

            if (originalTitleElement?.textContent 
                    && originalTitleElement.textContent.trim() === formattedTitle) {
                showOriginalTitle(element, brandingLocation);
                return false;
            }

            setCustomTitle(formattedTitle, element, brandingLocation);
            countTitleReplacement(videoID);
        } else if (originalTitleElement?.textContent) {
            // innerText is blank when visibility hidden
            const originalText = originalTitleElement.textContent.trim();
            const modifiedTitle = await formatTitle(originalText, false, videoID);
            if (!await isOnCorrectVideo(element, brandingLocation, videoID)) return false;

            if (originalText === modifiedTitle) {
                showOriginalTitle(element, brandingLocation);
                return false;
            }

            setCustomTitle(modifiedTitle, element, brandingLocation);
        } else {
            showOriginalTitle(element, brandingLocation);
        }

        if (originalTitleElement.parentElement?.title) {
            // Inside element should handle title fine
            originalTitleElement.parentElement.title = "";
        }

        showCustomTitle(element, brandingLocation);

        if (!showCustomBranding) {
            showOriginalTitle(element, brandingLocation);
        }

        if (!await shouldReplaceTitles(videoID)) {
            showOriginalTitle(element, brandingLocation);
            return false;
        }

        return true;
    } catch (e) {
        logError(e);
        showOriginalTitle(element, brandingLocation);

        return false;
    }
}

async function isOnCorrectVideo(element: HTMLElement, brandingLocation: BrandingLocation, videoID: VideoID): Promise<boolean> {
    return brandingLocation === BrandingLocation.Watch ? getVideoID() === videoID 
        : await extractVideoIDFromElement(element, brandingLocation) === videoID;
}

function hideOriginalTitle(element: HTMLElement, brandingLocation: BrandingLocation) {
    const originalTitleElement = getOriginalTitleElement(element, brandingLocation);
    originalTitleElement.style.display = "none";

    switch(brandingLocation) {
        case BrandingLocation.Watch: {
            setPageTitle("");
            break;
        }
    }
}

function showOriginalTitle(element: HTMLElement, brandingLocation: BrandingLocation) {
    const originalTitleElement = getOriginalTitleElement(element, brandingLocation);
    const titleElement = getOrCreateTitleElement(element, brandingLocation, originalTitleElement);
    
    titleElement.style.display = "none";
    if (isReduxInstalled()) {
        originalTitleElement.style.setProperty("display", "-webkit-box", "important");
    } else {
        originalTitleElement.style.setProperty("display", "inline", "important");
    }

    switch(brandingLocation) {
        case BrandingLocation.Watch: {
            if (originalTitleElement.classList.contains("ytd-miniplayer")) {
                originalTitleElement.style.setProperty("display", "inline-block", "important");
            }

            setPageTitle(originalTitleElement.textContent ?? "");
            break;
        }
    }
}

function hideCustomTitle(element: HTMLElement, brandingLocation: BrandingLocation) {
    const originalTitleElement = getOriginalTitleElement(element, brandingLocation);
    const titleElement = getOrCreateTitleElement(element, brandingLocation, originalTitleElement);

    titleElement.style.display = "none";
}

function showCustomTitle(element: HTMLElement, brandingLocation: BrandingLocation) {
    const originalTitleElement = getOriginalTitleElement(element, brandingLocation);
    const titleElement = getOrCreateTitleElement(element, brandingLocation, originalTitleElement);
    titleElement.style.removeProperty("display");

    switch(brandingLocation) {
        case BrandingLocation.Watch: {
            setPageTitle(titleElement.textContent ?? "");
            break;
        }
    }
}

function setCustomTitle(title: string, element: HTMLElement, brandingLocation: BrandingLocation) {
    const originalTitleElement = getOriginalTitleElement(element, brandingLocation);
    const titleElement = getOrCreateTitleElement(element, brandingLocation, originalTitleElement);
    titleElement.innerText = title;
    titleElement.title = title;

    switch(brandingLocation) {
        case BrandingLocation.Watch: {
            setPageTitle(title);
            break;
        }
    }
}

export function getOriginalTitleElement(element: HTMLElement, brandingLocation: BrandingLocation) {
    return element.querySelector(getTitleSelector(brandingLocation)
        .map((s) => `${s}:not(.cbCustomTitle)`).join(", ")) as HTMLElement;
}

function getTitleSelector(brandingLocation: BrandingLocation): string[] {
    switch (brandingLocation) {
        case BrandingLocation.Watch:
            return ["yt-formatted-string", ".ytp-title-link.yt-uix-sessionlink"];
        case BrandingLocation.Related:
            return ["#video-title"];
        case BrandingLocation.Endcards:
            return [".ytp-ce-video-title", ".ytp-ce-playlist-title"];
        case BrandingLocation.Autoplay:
            return [".ytp-autonav-endscreen-upnext-title"];
        case BrandingLocation.EndRecommendations:
            return [".ytp-videowall-still-info-title"];
        default:
            throw new Error("Invalid branding location");
    }
}

export function getOrCreateTitleElement(element: HTMLElement, brandingLocation: BrandingLocation, originalTitleElement?: HTMLElement): HTMLElement {
    return element.querySelector(".cbCustomTitle") as HTMLElement ?? 
        createTitleElement(element, originalTitleElement ?? getOriginalTitleElement(element, brandingLocation), brandingLocation);
}

function createTitleElement(element: HTMLElement, originalTitleElement: HTMLElement, brandingLocation: BrandingLocation): HTMLElement {
    const titleElement = brandingLocation !== BrandingLocation.Watch || originalTitleElement.classList.contains("miniplayer-title")
        ? originalTitleElement.cloneNode() as HTMLElement 
        : document.createElement("div");
    titleElement.classList.add("cbCustomTitle");

    if (brandingLocation === BrandingLocation.EndRecommendations
            || brandingLocation === BrandingLocation.Autoplay) {
        const container = document.createElement("div");
        container.appendChild(titleElement);
        originalTitleElement.parentElement?.prepend(container);

        // Move original title element over to this element
        container.prepend(originalTitleElement);
    } else {
        originalTitleElement.parentElement?.insertBefore(titleElement, originalTitleElement);
    }

    if (brandingLocation !== BrandingLocation.Watch) {
        const smallBrandingBox = !!titleElement.closest("ytd-grid-video-renderer");

        // To be able to show the show original button in the right place
        titleElement.parentElement!.style.display = "flex";
        titleElement.parentElement!.style.alignItems = "center";
        if (smallBrandingBox) titleElement.parentElement!.style.alignItems = "flex-start";
        titleElement.parentElement!.style.justifyContent = "space-between";
        titleElement.parentElement!.style.width = "100%";

        if (brandingLocation === BrandingLocation.Related) {
            // Move badges out of centered div
            const badges = titleElement.parentElement!.querySelectorAll("ytd-badge-supported-renderer");
            for (const badge of badges) {
                badge.parentElement!.parentElement!.prepend(badge);
            }
        }

        if (brandingLocation === BrandingLocation.Endcards) {
            titleElement.parentElement!.style.height = "auto";

            // Move duration out of centered div
            const durationElement = titleElement.parentElement!.querySelector(".ytp-ce-video-duration");
            if (durationElement) {
                titleElement.parentElement!.parentElement!.appendChild(durationElement);
            }
        }

        // For channel pages to make sure the show original button can be on the right
        const metaElement = element.querySelector("#meta") as HTMLElement;
        if (metaElement && !smallBrandingBox) {
            metaElement.style.width = "100%";
        }
    }

    if (brandingLocation === BrandingLocation.Watch) {
        // For mini player title
        titleElement.removeAttribute("is-empty");
    }

    return titleElement;
}

export async function hideAndUpdateShowOriginalButton(element: HTMLElement, brandingLocation: BrandingLocation,
        showCustomBranding: boolean, dontHide: boolean): Promise<void> {
    const originalTitleElement = getOriginalTitleElement(element, brandingLocation);
    const buttonElement = await findShowOriginalButton(originalTitleElement, brandingLocation);
    if (buttonElement) {
        const buttonImage = buttonElement.querySelector(".cbShowOriginalImage") as HTMLElement;
        if (buttonImage) {
            if (showCustomBranding) {
                buttonImage.classList.remove("cbOriginalShown");
                buttonElement.title = chrome.i18n.getMessage("ShowOriginal");
            } else {
                buttonImage.classList.add("cbOriginalShown");
                buttonElement.title = chrome.i18n.getMessage("ShowModified");
            }

            if (showCustomBranding === Config.config!.defaultToCustom 
                    && brandingLocation !== BrandingLocation.Watch
                    && !Config.config!.alwaysShowShowOriginalButton) {
                buttonElement.classList.remove("cbDontHide");
            } else {
                buttonElement.classList.add("cbDontHide");
            }
        }

        if (!dontHide) buttonElement.style.setProperty("display", "none", "important");
    }
}

export async function findShowOriginalButton(originalTitleElement: HTMLElement, brandingLocation: BrandingLocation): Promise<HTMLElement> {
    const referenceNode = brandingLocation === BrandingLocation.Watch 
        ? (await getOrCreateTitleButtonContainer())?.parentElement : originalTitleElement.parentElement;
    return referenceNode?.querySelector?.(".cbShowOriginal") as HTMLElement;
}

export async function findOrCreateShowOriginalButton(element: HTMLElement, brandingLocation: BrandingLocation,
        videoID: VideoID): Promise<HTMLElement> {
    const originalTitleElement = getOriginalTitleElement(element, brandingLocation);
    const buttonElement = await findShowOriginalButton(originalTitleElement, brandingLocation) 
        ?? await createShowOriginalButton(originalTitleElement, brandingLocation);

    buttonElement.setAttribute("videoID", videoID);
    buttonElement.style.removeProperty("display");
    return buttonElement;
}

async function createShowOriginalButton(originalTitleElement: HTMLElement,
        brandingLocation: BrandingLocation): Promise<HTMLElement> {
    const buttonElement = document.createElement("button");
    buttonElement.classList.add("cbShowOriginal");

    buttonElement.classList.add("cbButton");
    if (brandingLocation === BrandingLocation.Watch 
            || Config.config!.alwaysShowShowOriginalButton) {
        buttonElement.classList.add("cbDontHide");
    }

    const buttonImage = document.createElement("img");
    buttonElement.draggable = false;
    buttonImage.className = "cbShowOriginalImage";
    buttonImage.src = chrome.runtime.getURL("icons/logo.svg");
    buttonElement.appendChild(buttonImage);

    if (!Config.config?.defaultToCustom) {
        buttonImage.classList.add("cbOriginalShown");
        buttonElement.title = chrome.i18n.getMessage("ShowModified");
    } else {
        buttonElement.title = chrome.i18n.getMessage("ShowOriginal");
    }

    const getHoverPlayers = () => [
        originalTitleElement.closest("#dismissible")?.querySelector?.("#mouseover-overlay") as HTMLElement,
        document.querySelector("ytd-video-preview #player-container") as HTMLElement
    ];

    buttonElement.addEventListener("click", (e) => void (async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const videoID = buttonElement.getAttribute("videoID");
        if (videoID) {
            await toggleShowCustom(videoID as VideoID);

            // Hide hover play, made visible again when mouse leaves area
            for (const player of getHoverPlayers()) {
                if (player) {
                    player.style.display = "none";
                    const hoverPlayerVideo = player.querySelector("video");
                    if (hoverPlayerVideo) {
                        hoverPlayerVideo.pause();
                    }
                }
            }
        }
    })(e));

    if (originalTitleElement.parentElement) {
        originalTitleElement.parentElement.addEventListener("mouseleave", () => {
            for (const player of getHoverPlayers()) {
                if (player) {
                    player.style.removeProperty("display");

                    const hoverPlayerVideo = player.querySelector("video");
                    if (hoverPlayerVideo && hoverPlayerVideo.paused) {
                        hoverPlayerVideo.play().catch(logError);
                    }
                }
            }
        });
    }

    if (brandingLocation === BrandingLocation.Watch) {
        const referenceNode = await getOrCreateTitleButtonContainer();
        referenceNode?.prepend(buttonElement);
    } else {
        originalTitleElement.parentElement?.appendChild(buttonElement);
    }

    return buttonElement;
}