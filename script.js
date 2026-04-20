/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");

/* Replace this with your deployed Cloudflare Worker URL. */
const workerUrl = window.OPENAI_WORKER_URL || "";
const chatUiMessages = [];
const conversationMessages = [];
const systemMessage = {
  role: "system",
  content:
    "You are a friendly L'Oréal beauty assistant. Help with makeup, skincare, haircare, fragrance, routines, and product discovery. Keep answers clear, practical, and supportive.",
};

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderChatMessages() {
  chatWindow.innerHTML = chatUiMessages
    .map(
      (message) => `
        <div class="chat-message chat-message--${message.role}">
          <strong>${escapeHtml(message.label)}:</strong> ${escapeHtml(
            message.content,
          )}
        </div>
      `,
    )
    .join("");

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addChatMessage(role, content, label) {
  chatUiMessages.push({
    role,
    label,
    content,
  });

  renderChatMessages();
}

function updateChatMessage(index, role, content, label) {
  chatUiMessages[index] = {
    role,
    label,
    content,
  };

  renderChatMessages();
}

function getAssistantReply(data) {
  return data?.choices?.[0]?.message?.content;
}

/* Show an initial chat message */
addChatMessage(
  "assistant",
  "Ask me for a routine, product advice, or follow-up questions.",
  "Assistant",
);

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
      </div>
    </div>
  `,
    )
    .join("");
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory,
  );

  displayProducts(filteredProducts);
});

/* Send the chat request to the Cloudflare Worker */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = userInput.value.trim();

  if (!message) {
    return;
  }

  if (!workerUrl || workerUrl.includes("YOUR-WORKER-URL")) {
    addChatMessage(
      "error",
      "Set OPENAI_WORKER_URL in config.js to your deployed Worker endpoint.",
      "Error",
    );
    return;
  }

  addChatMessage("user", message, "You");
  conversationMessages.push({
    role: "user",
    content: message,
  });

  userInput.value = "";
  userInput.disabled = true;
  sendButton.disabled = true;

  const loadingMessageIndex =
    chatUiMessages.push({
      role: "assistant",
      label: "Assistant",
      content: "Thinking…",
    }) - 1;

  renderChatMessages();

  try {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [systemMessage, ...conversationMessages],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || "The Worker returned an error.");
    }

    const assistantReply = getAssistantReply(data);

    if (!assistantReply) {
      throw new Error("The Worker response did not include a reply.");
    }

    conversationMessages.push({
      role: "assistant",
      content: assistantReply,
    });

    updateChatMessage(
      loadingMessageIndex,
      "assistant",
      assistantReply,
      "Assistant",
    );
  } catch (error) {
    updateChatMessage(loadingMessageIndex, "error", error.message, "Error");
  } finally {
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus();
  }
});
