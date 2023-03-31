import { waitFor } from "@ajayyy/maze-utils";
import { getYouTubeTitleNode } from "@ajayyy/maze-utils/lib/elements";

export async function getOrCreateTitleButtonContainer(): Promise<HTMLElement | null> {
    const titleNode = await waitFor(() => getYouTubeTitleNode());
    const referenceNode = titleNode?.parentElement;

    if (referenceNode) {
        let titleButtonContainer = document.querySelector(".cbTitleButtonContainer") as HTMLElement;
        if (!titleButtonContainer) {
            titleButtonContainer = document.createElement("div");
            titleButtonContainer.classList.add("cbTitleButtonContainer");
            referenceNode.appendChild(titleButtonContainer);

            // Buttons on right
            referenceNode.style.display = "flex";
            referenceNode.style.justifyContent = "space-between";
        }

        return titleButtonContainer;
    }

    return null;
}

let badgeListener: MutationObserver | null = null;
export async function listenForBadges() {
    const titleNode = await waitFor(() => getYouTubeTitleNode());
    const referenceNode = titleNode?.parentElement;

    if (referenceNode) {
        badgeListener?.disconnect();
        badgeListener = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    for (const node of mutation.addedNodes) {
                        if (node instanceof HTMLElement
                                && node.classList.contains("ytd-badge-supported-renderer")) {
                            moveBadge(node);
                        }
                    }
                }
            }
        });

        badgeListener.observe(referenceNode, { childList: true });

        const badges = referenceNode.querySelectorAll("#title > ytd-badge-supported-renderer");
        for (const badge of badges) {
            moveBadge(badge as HTMLElement);
        }
    }
}

function moveBadge(badge: HTMLElement) {
    if (badge.parentElement?.parentElement) {
        // Move badges (unlisted, funding) up one element to fix layout issues
        badge.parentElement!.parentElement!.insertBefore(badge, badge.parentElement!.nextSibling);
    }
}