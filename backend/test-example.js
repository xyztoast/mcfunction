// Cache to store command JSONs
const commandCache = {};

/**
 * Main Entry Point
 */
async function applyHighlighting(text) {
    const lines = text.split('\n');
    let finalHtml = "";
    const errorLines = []; 

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. Handle Empty Lines
        if (line.trim() === "") {
            finalHtml += "\n";
            continue;
        }

        // 2. Handle Comments
        if (line.trim().startsWith('#')) {
            finalHtml += `<span class="hl-comment">${escapeHtml(line)}</span>\n`;
            continue;
        }

        // 3. Process Command Logic
        const segments = line.split(/(\s+)/);
        const processed = processSegmentsSync(segments);

        // Track errors for the gutter dots
        if (processed.includes('hl-error')) {
            errorLines.push(i + 1);
        }

        finalHtml += processed + "\n";
    }

    // Call the dot update in the HTML if it exists
    if (typeof window.updateErrorDots === "function") {
        window.updateErrorDots(errorLines);
    }

    return finalHtml;
}

/**
 * The "Brain" - Processes segments
 */
function processSegmentsSync(segments) {
    let processed = "";
    let commandData = null;
    let argCounter = 0;
    let restOfLineMode = false;
    let restOfLineClass = "";
    
    // NEW: Track branching state
    let currentNode = null;

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
                // Set the starting node if it exists (for branching)
                if (commandData.nodes) currentNode = commandData.nodes["root"];
            } else {
                // Not in cache? Fetch for next time and mark as error for now
                fetchCommandGrammar(segmentLower); 
                processed += `<span class="hl-error">${escapeHtml(segment)}</span>`;
            }
        } else {
            // Handle Execute Recursion
            if (segmentLower === "run" && commandData.command === "execute") {
                processed += `<span class="hl-command">run</span>`;
                processed += processSegmentsSync(segments.slice(i + 1));
                break; 
            }

            if (restOfLineMode) {
                processed += `<span class="${restOfLineClass}">${escapeHtml(segment)}</span>`;
                continue;
            }

            let expected = null;

            // BRANCHING LOGIC: If we have nodes, find the next one based on the word
            if (currentNode) {
                // Check if current word is a valid keyword option in this node
                if (currentNode.options && currentNode.options[segmentLower]) {
                    const nextNodeKey = currentNode.options[segmentLower];
                    expected = { type: "word", options: [segmentLower] }; // Highlight as keyword
                    currentNode = commandData.nodes[nextNodeKey]; // Move to the next state
                } 
                // Otherwise, check if this node expects a specific type (like target or int)
                else if (currentNode.type) {
                    expected = currentNode;
                    // Move to the next node in the chain if specified
                    currentNode = currentNode.next ? commandData.nodes[currentNode.next] : null;
                }
            } else {
                // FALLBACK: Original linear pattern logic
                expected = commandData.pattern ? commandData.pattern[argCounter] : null;
                argCounter++;
            }

            let cssClass = getHighlightClass(segment, expected);
            
            if (expected && expected.restOfLine === "true") {
                restOfLineMode = true;
                restOfLineClass = cssClass;
            }

            processed += `<span class="${cssClass || 'hl-error'}">${escapeHtml(segment)}</span>`;
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
            if (typeof updateHighlighting === "function") updateHighlighting();
        }
    } catch (e) { /* silent fail */ }
}

/**
 * Helper: Mapping JSON types to CSS classes
 */
function getHighlightClass(word, expected) {
    if (!expected) return "hl-error"; 

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

/* --- THEME SWITCHING LOGIC --- */

function setTheme(themeName) {
    const themeLink = document.getElementById('theme-link');
    if (themeLink) {
        const themeUrl = `theme/editor/${themeName.toLowerCase()}.css`;
        themeLink.href = themeUrl;
        localStorage.setItem('selected-editor-theme', themeName.toLowerCase());
        console.log("Switched theme to:", themeUrl);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('selected-editor-theme') || 'default';
    setTheme(savedTheme);

    const themeButtons = document.querySelectorAll('.sub-dropdown div');
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const themeName = btn.textContent.trim().toLowerCase();
            setTheme(themeName);
        });
    });
});
