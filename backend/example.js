const commandCache = {};

/**
 * Main entry point with logic to handle "word" wildcards
 */
async function applyHighlighting(text) {
    const lines = text.split('\n');
    let finalHtml = "";
    for (let line of lines) {
        if (line.trim().startsWith('#')) {
            finalHtml += `<span class="hl-comment">${escapeHtml(line)}</span>\n`;
            continue;
        }
        const segments = line.split(/(\s+)/);
        finalHtml += await processCommandSegments(segments) + "\n";
    }
    return finalHtml;
}

async function processCommandSegments(segments) {
    let processed = "";
    let commandData = null;
    let argCounter = 0;

    for (let i = 0; i < segments.length; i++) {
        let segment = segments[i];
        if (segment.trim() === "") {
            processed += segment;
            continue;
        }

        if (!commandData) {
            commandData = await fetchCommandGrammar(segment.toLowerCase());
            processed += `<span class="${commandData ? 'hl-command' : 'hl-error'}">${escapeHtml(segment)}</span>`;
        } else {
            // Execute recursion
            if (segment.toLowerCase() === "run" && commandData.command === "execute") {
                processed += `<span class="hl-command">run</span>`;
                processed += await processCommandSegments(segments.slice(i + 1));
                break; 
            }

            let expected = commandData.pattern[argCounter];
            let cssClass = getHighlightClass(segment, expected);
            processed += `<span class="${cssClass}">${escapeHtml(segment)}</span>`;
            argCounter++;
        }
    }
    return processed;
}

async function fetchCommandGrammar(cmd) {
    if (commandCache[cmd]) return commandCache[cmd];
    try {
        const response = await fetch(`./backend/commands/${cmd}.json`);
        if (!response.ok) return null;
        const data = await response.json();
        commandCache[cmd] = data; 
        return data;
    } catch (e) { return null; }
}

function getHighlightClass(word, expected) {
    if (!expected) return ""; 

    switch (expected.type) {
        case "target": 
            return /^(@[a-p|e|s|r|v]|@[a-p|e|s|r|v]\[.*\]|[A-Za-z0-9_]{3,16})$/i.test(word) ? "hl-selector" : "hl-error";
        
        case "word":
            // WILDCARD LOGIC: If options is ["*"], everything is valid.
            if (expected.options && expected.options.includes("*")) {
                return "hl-item"; 
            }
            if (expected.options && expected.options.includes(word.toLowerCase())) {
                return "hl-command"; 
            }
            return "hl-error";

        case "item_id": 
            return /^([a-z0-9_]+:)?[a-z0-9_]+$/.test(word) ? "hl-item" : "hl-error";
        
        case "int": 
            const coordRegex = /^([~^]-?\d*|-?\d+)$/;
            return coordRegex.test(word) ? "hl-number" : "hl-error";

        default: return "";
    }
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
