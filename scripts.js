const codeArea = document.getElementById('codeArea');
const highlightingContent = document.getElementById('highlightingContent');
const lineNumbers = document.getElementById('lineNumbers');

// Function to update the "highlighted" view and line numbers
function updateEditor() {
    let text = codeArea.value;

    // 1. Update Line Numbers
    const lines = text.split('\n').length;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');

    // 2. Syntax Highlighting (Manual Regex for mcfunction)
    // Note: Use .innerText for safety then replace with spans for colors
    highlightingContent.textContent = text; 
    applyMCFunctionHighlighting();
}

function applyMCFunctionHighlighting() {
    let content = highlightingContent.textContent;
    
    // Basic mcfunction highlighting patterns
    content = content
        .replace(/#.*$/gm, '<span class="comment">$&</span>') // Comments
        .replace(/\b(give|tp|say|execute|summon|setblock)\b/g, '<span class="command">$&</span>') // Commands
        .replace(/@([apere])/g, '<span class="selector">$&</span>') // Selectors
        .replace(/~|-?\d+(\.\d+)?/g, '<span class="coord">$&</span>'); // Coordinates/Numbers

    highlightingContent.innerHTML = content;
}

// Keep scrolling in sync
codeArea.addEventListener('scroll', () => {
    const highlighting = document.getElementById('highlighting');
    highlighting.scrollTop = codeArea.scrollTop;
    highlighting.scrollLeft = codeArea.scrollLeft;
    lineNumbers.scrollTop = codeArea.scrollTop;
});

codeArea.addEventListener('input', updateEditor);
window.addEventListener('load', updateEditor);
