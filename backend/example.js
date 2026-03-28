// Cache to store command JSONs so we don't fetch them every single keystroke
const commandCache = {};

/**
 * Main entry point called by editor.html
 */
async function applyHighlighting(text) {
    const lines = text.split('\n');
    let finalHtml = "";

    for (let line of lines) {
        // Handle Comments
        if (line.trim().startsWith('#')) {
            finalHtml += `<span class="hl-comment">${escapeHtml(line)}</span>\n`;
            continue;
        }

        const segments = line.split(/(\s+)/); // Keep spaces for perfect alignment
        let processedLine = "";
        let commandData = null;
        let argCounter = 0;

        for (let segment of segments) {
            // If it's just whitespace, append and skip
            if (segment.trim() === "") {
                processedLine += segment;
                continue;
            }

            // The first word is the command
            if (!commandData) {
                commandData = await fetchCommandGrammar(segment);
                if (commandData) {
                    processedLine += `<span class="hl-command">${escapeHtml(segment)}</span>`;
                } else {
                    // Highlight as error if command JSON isn't found
                    processedLine += `<span class="hl-error">${escapeHtml(segment)}</span>`;
                }
            } else {
                // It's an argument. Check it against the JSON pattern
                // Logic: commandData.pattern[0] is the first argument after the command name
                let expected = commandData.pattern[argCounter];
                let cssClass = getHighlightClass(segment, expected);
                
                processedLine += `<span class="${cssClass}">${escapeHtml(segment)}</span>`;
                argCounter++;
            }
        }
        finalHtml += processedLine + "\n";
    }
    // We add a zero-width space at the end to help with trailing newlines
    return finalHtml;
}

/**
 * Fetches your JSON file from the backend folder with Caching
 */
async function fetchCommandGrammar(cmd) {
    if (commandCache[cmd]) return commandCache[cmd];

    try {
        const response = await fetch(`backend/commands/${cmd}.json`);
        if (!response.ok) return null;
        const data = await response.json();
        commandCache[cmd] = data; // Store in cache
        return data;
    } catch (e) {
        return null;
    }
}

/**
 * Decides which CSS class to use based on the grammar type
 */
function getHighlightClass(word, expected) {
    if (!expected) return ""; // Extra arguments with no rules

    switch (expected.type) {
        case "target":
            return /^(@[a-p|e|s|r]|[A-Za-z0-9_]{3,16})$/.test(word) ? "hl-selector" : "hl-error";
        case "item_id":
            // Checks for minecraft:item or just item_name
            return /^[a-z0-9_]+:?[a-z0-9_]+$/.test(word) ? "hl-item" : "hl-error";
        case "int":
            return /^-?\d+$/.test(word) ? "hl-number" : "hl-error";
        default:
            return "";
    }
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
