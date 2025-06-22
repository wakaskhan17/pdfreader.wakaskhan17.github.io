// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

// Global variables
let pdfText = "";
let pdfDocument = null;
let currentPage = 1;
let apiKey = localStorage.getItem('pdfAnalyzer_apiKey') || "";

// Get all elements we need
const elements = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    pdfCanvas: document.getElementById('pdfCanvas'),
    pageInfo: document.getElementById('pageInfo'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    chatContainer: document.getElementById('chatContainer'),
    userInput: document.getElementById('userInput'),
    sendBtn: document.getElementById('sendBtn'),
    summarizeBtn: document.getElementById('summarizeBtn'),
    apiKeyBtn: document.getElementById('apiKeyBtn'),
    apiKeyModal: document.getElementById('apiKeyModal'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
    cancelBtn: document.getElementById('cancelBtn')
};

// Initialize the app when page loads
document.addEventListener('DOMContentLoaded', init);

function init() {
    setupEventListeners();
    
    // Check if we have an API key
    if (!apiKey) {
        showApiKeyModal();
    }
}

function setupEventListeners() {
    // File upload
    elements.dropzone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);
    elements.dropzone.addEventListener('dragover', handleDragOver);
    elements.dropzone.addEventListener('dragleave', handleDragLeave);
    elements.dropzone.addEventListener('drop', handleDrop);
    
    // PDF navigation
    elements.prevPage.addEventListener('click', () => navigatePage(-1));
    elements.nextPage.addEventListener('click', () => navigatePage(1));
    
    // Chat
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    elements.summarizeBtn.addEventListener('click', summarizeDocument);
    
    // API key
    elements.apiKeyBtn.addEventListener('click', showApiKeyModal);
    elements.saveApiKeyBtn.addEventListener('click', saveApiKey);
    elements.cancelBtn.addEventListener('click', hideApiKeyModal);
}

// Handle file selection
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        alert('Please select a PDF file');
        return;
    }

    // Update UI
    elements.dropzone.innerHTML = `<i class="fas fa-file-pdf fa-3x"></i><p>${file.name}</p>`;
    addMessage(`Processing PDF: ${file.name}...`, 'bot');
    
    try {
        // Load the PDF
        const arrayBuffer = await file.arrayBuffer();
        pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
        
        // Extract text from all pages
        pdfText = await extractTextFromPDF(pdfDocument);
        
        // Render first page
        await renderPage(1);
        
        // Enable chat features
        enableChatFeatures();
        
        addMessage("PDF loaded successfully! Ask me anything about it.", 'bot');
    } catch (error) {
        console.error('Error:', error);
        addMessage("Failed to process PDF. Please try another file.", 'bot');
    }
}

// Extract text from all pages
async function extractTextFromPDF(pdfDoc) {
    let fullText = "";
    
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        fullText += strings.join(' ') + '\n\n';
    }
    
    return fullText;
}

// Render a specific page
async function renderPage(pageNum) {
    if (!pdfDocument || pageNum < 1 || pageNum > pdfDocument.numPages) return;
    
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    
    // Set canvas size
    elements.pdfCanvas.height = viewport.height;
    elements.pdfCanvas.width = viewport.width;
    
    // Render PDF page to canvas
    await page.render({
        canvasContext: elements.pdfCanvas.getContext('2d'),
        viewport: viewport
    }).promise;
    
    currentPage = pageNum;
    updatePageControls();
}

// Update page navigation UI
function updatePageControls() {
    elements.pageInfo.textContent = `Page: ${currentPage}/${pdfDocument.numPages}`;
    elements.prevPage.disabled = currentPage <= 1;
    elements.nextPage.disabled = currentPage >= pdfDocument.numPages;
}

// Navigate between pages
function navigatePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= pdfDocument.numPages) {
        renderPage(newPage);
    }
}

// Enable chat features after PDF loads
function enableChatFeatures() {
    elements.userInput.disabled = false;
    elements.sendBtn.disabled = false;
    elements.summarizeBtn.disabled = false;
}

// Add message to chat
function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    messageDiv.textContent = text;
    elements.chatContainer.appendChild(messageDiv);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

// Send message to AI
async function sendMessage() {
    if (!apiKey) {
        showApiKeyModal();
        return;
    }
    
    const question = elements.userInput.value.trim();
    if (!question || !pdfText) return;

    // Add user message
    addMessage(question, 'user');
    elements.userInput.value = '';
    
    try {
        // Show "typing" indicator
        const typingMsg = addMessage("Thinking...", 'bot');
        
        // Get AI response
        const response = await queryOpenAI(question);
        
        // Remove typing indicator and show real response
        elements.chatContainer.removeChild(typingMsg);
        addMessage(response.answer, 'bot');
        
    } catch (error) {
        console.error('Error:', error);
        addMessage("Sorry, I encountered an error. Please try again.", 'bot');
    }
}

// Summarize document
async function summarizeDocument() {
    if (!apiKey) {
        showApiKeyModal();
        return;
    }
    
    addMessage("Generating summary...", 'bot');
    
    try {
        const response = await queryOpenAI(
            "Provide a detailed summary with bullet points of the key points in this document."
        );
        
        addMessage(`Summary:\n${response.answer}`, 'bot');
    } catch (error) {
        console.error('Error:', error);
        addMessage("Failed to generate summary. Please try again.", 'bot');
    }
}

// Query OpenAI API
async function queryOpenAI(question) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [{
                role: "user",
                content: `Document:\n${pdfText.substring(0, 8000)}\n\nQuestion: ${question}\n\nAnswer:`
            }],
            temperature: 0.3
        })
    });
    
    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    return {
        answer: data.choices[0].message.content
    };
}

// Drag and drop handlers
function handleDragOver(e) {
    e.preventDefault();
    elements.dropzone.style.backgroundColor = '#e8f4fc';
}

function handleDragLeave() {
    elements.dropzone.style.backgroundColor = '';
}

function handleDrop(e) {
    e.preventDefault();
    elements.dropzone.style.backgroundColor = '';
    elements.fileInput.files = e.dataTransfer.files;
    handleFileSelect({ target: elements.fileInput });
}

// API key management
function showApiKeyModal() {
    elements.apiKeyModal.style.display = 'flex';
}

function hideApiKeyModal() {
    elements.apiKeyModal.style.display = 'none';
}

function saveApiKey() {
    const newKey = elements.apiKeyInput.value.trim();
    if (!newKey.startsWith('sk-')) {
        alert("Please enter a valid OpenAI API key");
        return;
    }
    
    apiKey = newKey;
    localStorage.setItem('pdfAnalyzer_apiKey', newKey);
    hideApiKeyModal();
    addMessage("API key saved successfully!", 'bot');
}