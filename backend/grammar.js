// Cache to store command JSONs
const commandCache = {};

// Cache for color codes (loaded from colorcodes.json)
const colorCodeCache = {};

/**
 * Load color codes from backend/colorcodes.json
 */
(async function loadColorCodes() {
    try {
        const response = await fetch("./backend/colorcodes.json");
        if (response.ok) {
            const data = await response.json();
            Object.assign(colorCodeCache, data);
        }
    } catch (e) { /* silent fail */ }
})();

/**
 * Apply §x color codes within a segment string.
 * Splits the text on §x sequences and wraps each chunk with the correct inline color.
 * Only hex color values are applied — l, o, k etc are ignored.
 * Returns { html, activeColor } where activeColor is the last active color after this segment
 * (so it can carry into the next segment), or null if reset by a "
 */
function applyColorCodes(text, cssClass, incomingColor) {
    const pattern = /§([0-9a-fA-FrR])/g;

    let result = "";
    let lastIndex = 0;
    let currentColor = incomingColor || null;

    // Helper: wrap a chunk of text in the right span
    function wrapChunk(chunk) {
        if (!chunk) return "";
        const escaped = escapeHtml(chunk);
        if (currentColor) {
            return `<span class="${cssClass}" style="color:${currentColor}">${escaped}</span>`;
        }
        return `<span class="${cssClass}">${escaped}</span>`;
    }

    // Helper: render a chunk and handle " reset within it
    function renderChunk(chunk) {
        if (!chunk) return "";
        const quoteIdx = chunk.indexOf('"');
        if (quoteIdx !== -1) {
            const beforeQuote = chunk.slice(0, quoteIdx + 1);
            const afterQuote = chunk.slice(quoteIdx + 1);
            const out = wrapChunk(beforeQuote);
            currentColor = null;
            return out + wrapChunk(afterQuote);
        }
        return wrapChunk(chunk);
    }

    let match;
    while ((match = pattern.exec(text)) !== null) {
        const before = text.slice(lastIndex, match.index);
        result += renderChunk(before);

        const code = match[1].toLowerCase();
        const value = colorCodeCache[code];

        if (code === "r") {
            currentColor = null;
        } else if (value && value.startsWith("#")) {
            currentColor = value;
        }
        // non-color codes (l, o, k) silently ignored

        // Render the §x itself dimmed so it's visible but unobtrusive
        result += `<span class="hl-colorcode">${escapeHtml(match[0])}</span>`;

        lastIndex = pattern.lastIndex;
    }

    // Render whatever is left after the last §x
    result += renderChunk(text.slice(lastIndex));

    return { html: result, activeColor: currentColor };
}

/**
 * Check if a segment contains any § color codes worth processing
 */
function hasColorCodes(text) {
    return text.includes("§");
}

/**
 * Render a single segment with color code support applied on top of a css class.
 * If the segment has no § codes, falls back to normal rendering.
 * activeColor is the carried-in color from a previous segment.
 * Returns { html, activeColor }
 */
function renderSegment(segment, cssClass, activeColor) {
    if (hasColorCodes(segment)) {
        return applyColorCodes(segment, cssClass, activeColor);
    }
    let nextColor = activeColor;
    let html;
    if (activeColor) {
        html = `<span class="${cssClass}" style="color:${activeColor}">${escapeHtml(segment)}</span>`;
        if (segment.includes('"')) nextColor = null;
    } else {
        html = `<span class="${cssClass}">${escapeHtml(segment)}</span>`;
    }
    return { html, activeColor: nextColor };
}

/**
 * The "Brain" - Processes segments with the "Elimination Race" logic
 */
function processSegmentsSync(segments) {
    let processed = "";
    let commandData = null;
    let activePatterns = []; // This holds all the valid paths we are currently racing
    let argCounter = 0;
    let restOfLineMode = false;
    let restOfLineClass = "";
    let activeColor = null; // Tracks carried §x color across segments

    for (let i = 0; i < segments.length; i++) {
        let segment = segments[i];

        // Preserve whitespace
        if (segment.trim() === "") {
            processed += segment;
            continue;
        }

        const segmentLower = segment.toLowerCase();
        
if (!commandData && segment.startsWith("/")) {
    processed += `<span class="hl-error">${escapeHtml(segment)}</span>`;
    break;
}
        if (!commandData) {
            // Check cache for the base command (e.g., "give", "tickingarea")
            commandData = commandCache[segmentLower];

            if (commandData) {
                processed += `<span class="hl-command">${escapeHtml(segment)}</span>`;
                
                // Initialize the Race!
                if (commandData.overloads) {
                    // If it has multiple paths, load them all
                    activePatterns = commandData.overloads.map(o => o.pattern);
                } else if (commandData.pattern) {
                    // If it's a simple file like fill.json, just load the one path
                    activePatterns = [commandData.pattern];
                } else {
                    activePatterns = [];
                }

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
                const r = renderSegment(segment, restOfLineClass, activeColor);
                processed += r.html;
                activeColor = r.activeColor;
                continue;
            }

            // --- THE ELIMINATION RACE ---
            let bestClass = "hl-error";
            let matchedExpected = null;

            // Filter down the patterns to only the ones that match the current word
            let survivingPatterns = activePatterns.filter(pattern => {
                let expected = pattern[argCounter];
                
                // If this pattern ran out of arguments but the user is still typing, eliminate it
                if (!expected) return false; 
                
                let cssClass = getHighlightClass(segment, expected);
                // If the class isn't an error, this pattern survives!
                return cssClass !== "hl-error";
            });

            if (survivingPatterns.length > 0) {
                // We have a match! Update our active list to only the survivors
                activePatterns = survivingPatterns;
                
                // Grab the expected object from the first survivor to determine the CSS/RestOfLine
                matchedExpected = activePatterns[0][argCounter];
                bestClass = getHighlightClass(segment, matchedExpected);
            } else {
                // No patterns matched. The user typed an error.
                bestClass = "hl-error";
            }

            // Check for the new restOfLine state using the winning pattern
            if (matchedExpected && matchedExpected.restOfLine === "true") {
                restOfLineMode = true;
                restOfLineClass = bestClass;
            }

            const r = renderSegment(segment, bestClass, activeColor);
            processed += r.html;
            activeColor = r.activeColor;

            argCounter++;

            // --- THE 3 LINES FOR CHAINING ---
            if (activePatterns.length > 0 && argCounter >= activePatterns[0].length && !restOfLineMode) {
                argCounter = 0; 
            }
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
                if (expected.options.includes(word.toLowerCase())) return "hl-word"; 
            }
            if (expected.restOfLine === "true") return "hl-item";
            return "hl-error";
        case "item_id": 
            return /^([a-z0-9_]+:)?[a-z0-9_]+$/.test(word) ? "hl-item" : "hl-error";
        case "int": 
            // 1. Check if it's a valid coordinate (~, ^) or decimal number
            const isNumeric = /^([~^]-?\d*\.?\d*|-?\d+\.?\d*)$/.test(word);
            if (!isNumeric) return "hl-error";

            // 2. If it's a raw number (not relative), check min/max constraints
            if (/^-?\d+\.?\d*$/.test(word)) {
                const val = parseFloat(word);
                if (expected.min !== undefined && val < expected.min) return "hl-error";
                if (expected.max !== undefined && val > expected.max) return "hl-error";
            }
            return "hl-number";
        default: return "";
    }
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
