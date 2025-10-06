const container = document.querySelector(".container");
const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = promptForm.querySelector(".prompt-input");
const fileInput = promptForm.querySelector("#file-input");
const fileUploadWrapper = promptForm.querySelector(".file-upload-wrapper");
const themeToggleBtn = document.querySelector("#theme-toggle-btn");

// API Setup
const API_KEY = "AIzaSyDfBKYVo_R_rkFm-AOpgw8VRtV31-TS4M0";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

let controller, typingInterval;
const chatHistory = [];

// Text-to-Speech variables
let currentSpeech = null;

// Set initial theme from local storage
const isLightTheme = localStorage.getItem("themeColor") === "light_mode";
document.body.classList.toggle("light-theme", isLightTheme);
themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";

// Function to create message elements
const createMessageElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
};

// Scroll to the bottom of the container
const scrollToBottom = () => {
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
};

// Copy message to clipboard function
const copyMessageToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        // Show temporary copy feedback
        const tempMsg = document.createElement('div');
        tempMsg.textContent = 'Copied to clipboard!';
        tempMsg.className = 'copy-feedback';
        document.body.appendChild(tempMsg);
        setTimeout(() => tempMsg.remove(), 1500);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
};

// Add click event for message copying
chatsContainer.addEventListener('click', (e) => {
    const messageText = e.target.closest('.message-text');
    if (messageText && !document.body.classList.contains('bot-responding')) {
        copyMessageToClipboard(messageText.textContent);
    }
});

// Text-to-Speech functionality
const speakText = (text) => {
    // Stop any ongoing speech
    if (currentSpeech) {
        window.speechSynthesis.cancel();
        currentSpeech = null;
        updateTTSButtons();
        return;
    }

    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'en-US';
    speech.rate = 1.0;
    speech.pitch = 1.0;
    
    speech.onend = () => {
        currentSpeech = null;
        updateTTSButtons();
    };
    
    speech.onerror = () => {
        currentSpeech = null;
        updateTTSButtons();
    };
    
    window.speechSynthesis.speak(speech);
    currentSpeech = speech;
    updateTTSButtons();
};

const updateTTSButtons = () => {
    document.querySelectorAll('.tts-btn').forEach(btn => {
        if (currentSpeech) {
            btn.textContent = 'stop';
            btn.style.color = '#d62939';
        } else {
            btn.textContent = 'volume_up';
            btn.style.color = '';
        }
    });
};

// Add TTS button to bot messages
const addTTSButton = (botMsgDiv) => {
    const ttsBtn = document.createElement('button');
    ttsBtn.className = 'tts-btn material-symbols-rounded';
    ttsBtn.textContent = 'volume_up';
    ttsBtn.title = 'Read aloud';
    
    ttsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const messageText = botMsgDiv.querySelector('.message-text').textContent;
        speakText(messageText);
    });
    
    botMsgDiv.appendChild(ttsBtn);
};

// Chat history persistence
const saveChatHistory = () => {
    const chatData = {
        history: chatHistory,
        messages: chatsContainer.innerHTML,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem('phiChatHistory', JSON.stringify(chatData));
};

const loadChatHistory = () => {
    const saved = localStorage.getItem('phiChatHistory');
    if (saved) {
        try {
            const chatData = JSON.parse(saved);
            chatHistory.length = 0;
            chatData.history.forEach(msg => chatHistory.push(msg));
            chatsContainer.innerHTML = chatData.messages;
            
            // Reattach TTS buttons to loaded messages
            chatsContainer.querySelectorAll('.bot-message').forEach(botMsg => {
                if (!botMsg.querySelector('.tts-btn')) {
                    addTTSButton(botMsg);
                }
            });
            
            if (chatsContainer.children.length > 0) {
                document.body.classList.add('chats-active');
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }
};

const clearChatHistory = () => {
    localStorage.removeItem('phiChatHistory');
};

// Simulate typing effect for bot responses
const typingEffect = (text, textElement, botMsgDiv) => {
    textElement.textContent = "";
    const words = text.split(" ");
    let wordIndex = 0;
    
    // Set an interval to type each word
    typingInterval = setInterval(() => {
        if (wordIndex < words.length) {
            textElement.textContent += (wordIndex === 0 ? "" : " ") + words[wordIndex++];
            scrollToBottom();
        } else {
            clearInterval(typingInterval);
            botMsgDiv.classList.remove("loading");
            document.body.classList.remove("bot-responding");
        }
    }, 40); // 40 ms delay
};

// Make the API call and generate the bot's response
const generateResponse = async (botMsgDiv) => {
    const textElement = botMsgDiv.querySelector(".message-text");
    controller = new AbortController();
    
    // Add user message to the chat history
    chatHistory.push({
        role: "user",
        parts: [{ text: promptInput.value.trim() }]
    });

    try {
        // Send the chat history to the API to get a response
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                contents: chatHistory,
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                }
            }),
            signal: controller.signal,
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "API request failed");
        
        // Process the response text and display with typing effect
        const responseText = data.candidates[0].content.parts[0].text.replace(/\*\*([^*]+)\*\*/g, "$1").trim();
        typingEffect(responseText, textElement, botMsgDiv);
        chatHistory.push({ role: "model", parts: [{ text: responseText }] });
        
        // Save history after response
        setTimeout(saveChatHistory, 100);
    } catch (error) {
        console.error("API Error:", error);
        textElement.textContent = error.name === "AbortError" ? "Response generation stopped." : `Error: ${error.message}`;
        textElement.style.color = "#d62939";
        botMsgDiv.classList.remove("loading");
        document.body.classList.remove("bot-responding");
        scrollToBottom();
    }
};

// Handle the form submission
const handleFormSubmit = (e) => {
    e.preventDefault();
    const userMessage = promptInput.value.trim();
    if (!userMessage || document.body.classList.contains("bot-responding")) return;
    
    document.body.classList.add("chats-active", "bot-responding");
    fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");
    
    // Generate user message HTML
    const userMsgHTML = `<p class="message-text">${userMessage}</p>`;
    const userMsgDiv = createMessageElement(userMsgHTML, "user-message");
    chatsContainer.appendChild(userMsgDiv);
    scrollToBottom();
    
    setTimeout(() => {
        // Generate bot message HTML and add in the chat container
        const botMsgHTML = `<img class="avatar" src="gemini1.svg" alt="AI Assistant" /> <p class="message-text">Thinking...</p>`;
        const botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
        chatsContainer.appendChild(botMsgDiv);
        addTTSButton(botMsgDiv); // Add TTS button
        scrollToBottom();
        generateResponse(botMsgDiv);
    }, 600);
    
    // Save to history
    setTimeout(saveChatHistory, 100);
    promptInput.value = "";
};

// Handle file input change (file upload)
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    
    const isImage = file.type.startsWith("image/");
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (e) => {
        fileInput.value = "";
        const base64String = e.target.result.split(",")[1];
        const filePreview = fileUploadWrapper.querySelector(".file-preview");
        
        if (isImage) {
            filePreview.src = e.target.result;
        }
        
        fileUploadWrapper.classList.add("active", isImage ? "img-attached" : "file-attached");
    };
    
    reader.onerror = () => {
        alert("Error reading file. Please try again.");
    };
});

// Cancel file upload
document.querySelector("#cancel-file-btn").addEventListener("click", () => {
    fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");
});

// Stop Bot Response
document.querySelector("#stop-response-btn").addEventListener("click", () => {
    controller?.abort();
    clearInterval(typingInterval);
    
    const loadingMessage = chatsContainer.querySelector(".bot-message.loading");
    if (loadingMessage) {
        loadingMessage.classList.remove("loading");
        const textElement = loadingMessage.querySelector(".message-text");
        textElement.textContent = "Response stopped.";
        textElement.style.color = "#d62939";
    }
    
    document.body.classList.remove("bot-responding");
});

// Toggle dark/light theme
themeToggleBtn.addEventListener("click", () => {
    const isLightTheme = document.body.classList.toggle("light-theme");
    localStorage.setItem("themeColor", isLightTheme ? "light_mode" : "dark_mode");
    themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";
});

// Delete all chats
document.querySelector("#delete-chats-btn").addEventListener("click", () => {
    if (chatsContainer.children.length > 0) {
        if (confirm("Are you sure you want to delete all chats?")) {
            chatHistory.length = 0;
            chatsContainer.innerHTML = "";
            document.body.classList.remove("chats-active", "bot-responding");
            clearChatHistory();
        }
    }
});

// Handle suggestions click
document.querySelectorAll(".suggestions-item").forEach((suggestion) => {
    suggestion.addEventListener("click", () => {
        promptInput.value = suggestion.querySelector(".text").textContent;
        promptForm.dispatchEvent(new Event("submit"));
    });
});

// Show/hide controls for mobile on prompt input focus
document.addEventListener("click", ({ target }) => {
    const wrapper = document.querySelector(".prompt-wrapper");
    const shouldHide = target.classList.contains("prompt-input") || 
                      (wrapper.classList.contains("hide-controls") && 
                       (target.id === "add-file-btn" || target.id === "stop-response-btn"));
    wrapper.classList.toggle("hide-controls", shouldHide);
});

// Add event listeners for form submission and file input click
promptForm.addEventListener("submit", handleFormSubmit);
promptForm.querySelector("#add-file-btn").addEventListener("click", () => fileInput.click());

// Handle Enter key for submission
promptInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        promptForm.dispatchEvent(new Event("submit"));
    }
});

// Initialize the app
console.log("PHI AI Bot Assistant VR1 initialized successfully!");

// Load saved chat history
loadChatHistory();
