// Cache to store command JSONs
const commandCache = {};

/**
 * The "Brain" - Processes segments
 */
function processSegmentsSync(segments) {
    let processed = "";
    let commandData = null;
    let argCounter = 0;
    let restOfLineMode = false;
    let restOfLineClass = "";

    for (let i = 0; i < segments.length; i++) {
        let segment = segments[i];

        // Preserve whitespace
        if (segment.trim() === "") {
            processed += segment;
            continue;
        }

        const segmentLower = segment.toLowerCase();

        if (!commandData) {
            // Check cache for the base command (e.g., "give")
            commandData = commandCache[segmentLower];

            if (commandData) {
                processed += `<span class="hl-command">${escapeHtml(segment)}</span>`;
            } else {
                // Not in cache? Fetch for next time and mark as error for now
                fetchCommandGrammar(segmentLower); 
                processed += `<span class="hl-error">${escapeHtml(segment)}</span>`;
            }
        } else {
            // Handle Execute Recursion
            if (segmentLower === "run" && commandData.command === "execute") {
                processed += `<span class="hl-command">run</span>`;
                // Process the rest of the line as a new command
                processed += processSegmentsSync(segments.slice(i + 1));
                break; 
            }

            // If we hit a restOfLine trigger previously, keep using that class
            if (restOfLineMode) {
                processed += `<span class="${restOfLineClass}">${escapeHtml(segment)}</span>`;
                continue;
            }

            // Highlight arguments based on the JSON pattern
            let expected = commandData.pattern[argCounter];
            let cssClass = getHighlightClass(segment, expected);
            
            // Check for the new restOfLine state
            if (expected && expected.restOfLine === "true") {
                restOfLineMode = true;
                restOfLineClass = cssClass;
            }

            processed += `<span class="${cssClass}">${escapeHtml(segment)}</span>`;
            argCounter++;
        }
    }
    return processed;
}

/**
 * Background Fetcher
 */
async function fetchCommandGrammar(cmd) {
    if (commandCache[cmd] || !cmd) return;
    try {
        const response = await fetch(`./backend/commands/${cmd}.json`);
        if (response.ok) {
            const data = await response.json();
            commandCache[cmd] = data;
            // Re-run highlighting now that we have the data
            if (typeof updateHighlighting === "function") updateHighlighting();
        }
    } catch (e) { /* silent fail */ }
}

/**
 * Helper: Mapping JSON types to CSS classes
 */
function getHighlightClass(word, expected) {
    if (!expected) return ""; 

    switch (expected.type) {
        case "target": 
            return /^(@[a-p|e|s|r|v]|@[a-p|e|s|r|v]\[.*\]|[A-Za-z0-9_]{3,16})$/i.test(word) ? "hl-selector" : "hl-error";
        case "word":
            if (expected.options) {
                if (expected.options.includes("*")) return "hl-item"; 
                if (expected.options.includes(word.toLowerCase())) return "hl-command"; 
            }
            if (expected.restOfLine === "true") return "hl-item";
            return "hl-error";
        case "item_id": 
            return /^([a-z0-9_]+:)?[a-z0-9_]+$/.test(word) ? "hl-item" : "hl-error";
        case "int": 
            return /^([~^]-?\d*|-?\d+)$/.test(word) ? "hl-number" : "hl-error";
        default: return "";
    }
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
