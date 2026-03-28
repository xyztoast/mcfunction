// Cache to store command JSONs
const commandCache = {};

/**
 * Main entry point
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
        let processedLine = "";
        
        // We use a helper function to process segments so we can handle "execute ... run"
        processedLine = await processCommandSegments(segments);
        
        finalHtml += processedLine + "\n";
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
            const cmdClean = segment.toLowerCase();
            commandData = await fetchCommandGrammar(cmdClean);
            
            if (commandData) {
                processed += `<span class="hl-command">${escapeHtml(segment)}</span>`;
            } else {
                processed += `<span class="hl-error">${escapeHtml(segment)}</span>`;
            }
        } else {
            // SPECIAL CASE: Execute "run" starts a new command sequence
            if (segment.toLowerCase() === "run" && commandData.command === "execute") {
                processed += `<span class="hl-command">run</span>`;
                // Process the rest of the segments as a brand new command
                const remaining = segments.slice(i + 1);
                processed += await processCommandSegments(remaining);
                break; // Exit this loop, the recursive call handled the rest
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
            return isValidTarget(word) ? "hl-selector" : "hl-error";
        
        case "word":
            // Checks if the word matches one of the allowed options in the JSON
            if (expected.options && expected.options.includes(word.toLowerCase())) {
                return "hl-command"; // Using command color for keywords like 'at' or 'as'
            }
            return "hl-error";

        case "item_id": 
            return /^([a-z0-9_]+:)?[a-z0-9_]+$/.test(word) ? "hl-item" : "hl-error";
        
        case "int": 
            // Matches numbers AND coordinates like ~ -5 or ^10
            const coordRegex = /^([~^]-?\d*|-?\d+)$/;
            return coordRegex.test(word) ? "hl-number" : "hl-error";

        case "json_component":
            return word.startsWith('{') ? "hl-item" : "hl-error";

        default: 
            return "";
    }
}

function isValidTarget(word) {
    const basicSelector = /^@(p|a|r|e|s|v|initiator)$/i;
    const complexSelector = /^@(p|a|r|e|s|v|initiator)\[.*\]$/i;
    const playerName = /^[A-Za-z0-9_]{3,16}$/;
    return basicSelector.test(word) || complexSelector.test(word) || playerName.test(word);
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
