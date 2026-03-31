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
                if (expected.options.includes(word.toLowerCase())) return "hl-command"; 
            }
            // If it's a restOfLine word but not in options, we still treat it as hl-item/command rather than error
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
        // We use a relative path since the files are in your repo
        // This builds the path: theme/editor/[name].css
        const themeUrl = `theme/editor/${themeName.toLowerCase()}.css`;
        
        themeLink.href = themeUrl;
        localStorage.setItem('selected-editor-theme', themeName.toLowerCase());
        
        console.log("Switched theme to:", themeUrl);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    // 1. Load saved theme
    const savedTheme = localStorage.getItem('selected-editor-theme') || 'default';
    setTheme(savedTheme);

    // 2. Attach click events to your dropdown divs
    const themeButtons = document.querySelectorAll('.sub-dropdown div');
    
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const themeName = btn.textContent.trim().toLowerCase();
            setTheme(themeName);
        });
    });
});
