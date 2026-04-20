/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");

/* Replace this with your deployed Cloudflare Worker URL. */
const workerUrl = window.OPENAI_WORKER_URL || "";
const chatUiMessages = [];
const conversationMessages = [];
const selectedProducts = new Map();
let displayedProducts = [];
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

function renderSelectedProducts() {
  if (selectedProducts.size === 0) {
    selectedProductsList.innerHTML = `
      <div class="selected-products-empty">
        Click a product card to add it here.
      </div>
    `;
    return;
  }

  selectedProductsList.innerHTML = Array.from(selectedProducts.values())
    .map(
      (product) => `
        <div class="selected-product-item">
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <p>${escapeHtml(product.brand)}</p>
          </div>
          <button
            type="button"
            class="remove-selected-btn"
            data-product-id="${product.id}"
            aria-label="Remove ${escapeHtml(product.name)}"
          >
            Remove
          </button>
        </div>
      `
    )
    .join("");
}

function renderProducts(products) {
  displayedProducts = products;

  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products found for this category.
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProducts.has(product.id);

      return `
        <div
          class="product-card${isSelected ? " is-selected" : ""}"
          data-product-id="${product.id}"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected}"
        >
          <img src="${product.image}" alt="${escapeHtml(product.name)}">
          <div class="product-info">
            <h3>${escapeHtml(product.name)}</h3>
            <p>${escapeHtml(product.brand)}</p>
          </div>
        </div>
      `;
    })
    .join("");
}

function toggleProductSelection(productId) {
  const product = displayedProducts.find(
    (displayedProduct) => displayedProduct.id === productId,
  );

  if (!product) {
    return;
  }

  if (selectedProducts.has(productId)) {
    selectedProducts.delete(productId);
  } else {
    selectedProducts.set(productId, product);
  }

  renderSelectedProducts();
  renderProducts(displayedProducts);
}

selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-selected-btn");

  if (!removeButton) {
    return;
  }

  const productId = Number(removeButton.dataset.productId);
  selectedProducts.delete(productId);
  renderSelectedProducts();
  renderProducts(displayedProducts);
});

productsContainer.addEventListener("click", (event) => {
  const productCard = event.target.closest(".product-card");

  if (!productCard || !productsContainer.contains(productCard)) {
    return;
  }

  toggleProductSelection(Number(productCard.dataset.productId));
});

productsContainer.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const productCard = event.target.closest(".product-card");

  if (!productCard || !productsContainer.contains(productCard)) {
    return;
  }

  event.preventDefault();
  toggleProductSelection(Number(productCard.dataset.productId));
});

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
  renderProducts(products);
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

renderSelectedProducts();

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
