/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const clearSearchButton = document.getElementById("clearSearchBtn");
const productResultsCount = document.getElementById("productResultsCount");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsButton = document.getElementById("clearSelectionsBtn");
const generateRoutineButton = document.getElementById("generateRoutine");
const productModal = document.getElementById("productModal");
const productModalImage = document.getElementById("productModalImage");
const productModalBrand = document.getElementById("productModalBrand");
const productModalTitle = document.getElementById("productModalTitle");
const productModalDescription = document.getElementById(
  "productModalDescription",
);
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");

/* Replace this with your deployed Cloudflare Worker URL. */
const workerUrl = window.OPENAI_WORKER_URL || "";
const savedSelectionsKey = "loreal-selected-products";
const savedDirectionKey = "loreal-layout-direction";
const chatUiMessages = [];
const conversationMessages = [];
const selectedProducts = new Map();
let activeModalProduct = null;
let displayedProducts = [];
let allProducts = [];
const rtlLanguagePrefixes = ["ar", "fa", "he", "ur"];
const systemMessage = {
  role: "system",
  content:
    "You are a friendly L'Oréal beauty assistant. Help with makeup, skincare, haircare, fragrance, routines, and product discovery. Keep answers clear, practical, and supportive.",
};

function isRtlLanguage(languageCode) {
  if (!languageCode) {
    return false;
  }

  const normalizedCode = languageCode.toLowerCase();
  return rtlLanguagePrefixes.some((prefix) =>
    normalizedCode.startsWith(prefix),
  );
}

function getRequestedDirection() {
  const dirFromMarkup = document.documentElement.getAttribute("dir");

  if (dirFromMarkup === "rtl" || dirFromMarkup === "ltr") {
    return dirFromMarkup;
  }

  const dirFromQuery = new URLSearchParams(window.location.search).get("dir");

  if (dirFromQuery === "rtl" || dirFromQuery === "ltr") {
    return dirFromQuery;
  }

  const dirFromStorage = localStorage.getItem(savedDirectionKey);

  if (dirFromStorage === "rtl" || dirFromStorage === "ltr") {
    return dirFromStorage;
  }

  return isRtlLanguage(document.documentElement.lang) ? "rtl" : "ltr";
}

function applyDocumentDirection(direction) {
  const safeDirection = direction === "rtl" ? "rtl" : "ltr";

  document.documentElement.setAttribute("dir", safeDirection);
  localStorage.setItem(savedDirectionKey, safeDirection);
}

applyDocumentDirection(getRequestedDirection());

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

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, query) {
  if (!query) {
    return escapeHtml(text);
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "ig"));
  const queryLower = query.toLowerCase();

  return parts
    .map((part) => {
      if (part.toLowerCase() === queryLower) {
        return `<mark>${escapeHtml(part)}</mark>`;
      }

      return escapeHtml(part);
    })
    .join("");
}

function formatInlineText(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>");
}

function renderTextBlocks(content) {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${formatInlineText(line)}</p>`)
    .join("");
}

function getHeadingText(line) {
  const markdownHeadingMatch = line.match(/^#{1,3}\s+(.+)$/);

  if (markdownHeadingMatch) {
    return markdownHeadingMatch[1].trim();
  }

  const routineHeadingMatch = line.match(
    /^(morning|evening|night|weekly|routine overview|summary|tips?)\b.*:?$/i,
  );

  if (routineHeadingMatch) {
    return line.replace(/:+$/, "").trim();
  }

  return null;
}

function getNumberedStep(line) {
  const stepMatch = line.match(/^(?:step\s*)?(\d+)[\).:\-\s]+(.+)$/i);

  if (!stepMatch) {
    return null;
  }

  return {
    number: stepMatch[1],
    text: stepMatch[2].trim(),
  };
}

function getBulletItem(line) {
  const bulletMatch = line.match(/^[-*•]\s+(.+)$/);

  if (!bulletMatch) {
    return null;
  }

  return bulletMatch[1].trim();
}

function formatAssistantContent(content) {
  const lines = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "<p>No response received.</p>";
  }

  const htmlParts = [];
  let activeListType = "none";

  function closeList() {
    if (activeListType === "steps") {
      htmlParts.push("</ol>");
    }

    if (activeListType === "bullets") {
      htmlParts.push("</ul>");
    }

    activeListType = "none";
  }

  lines.forEach((line) => {
    const headingText = getHeadingText(line);

    if (headingText) {
      closeList();
      htmlParts.push(
        `<h4 class="assistant-heading">${formatInlineText(headingText)}</h4>`,
      );
      return;
    }

    const step = getNumberedStep(line);

    if (step) {
      if (activeListType !== "steps") {
        closeList();
        htmlParts.push('<ol class="assistant-steps">');
        activeListType = "steps";
      }

      htmlParts.push(`
        <li class="assistant-step">
          <div class="assistant-step__badge">Step ${escapeHtml(step.number)}</div>
          <p class="assistant-step__text">${formatInlineText(step.text)}</p>
        </li>
      `);
      return;
    }

    const bulletText = getBulletItem(line);

    if (bulletText) {
      if (activeListType !== "bullets") {
        closeList();
        htmlParts.push('<ul class="assistant-list">');
        activeListType = "bullets";
      }

      htmlParts.push(`<li>${formatInlineText(bulletText)}</li>`);
      return;
    }

    closeList();
    htmlParts.push(
      `<p class="assistant-paragraph">${formatInlineText(line)}</p>`,
    );
  });

  closeList();

  return `<div class="assistant-rich">${htmlParts.join("")}</div>`;
}

function getDescriptionPreview(description) {
  const words = description.split(/\s+/);

  if (words.length <= 18) {
    return description;
  }

  return `${words.slice(0, 18).join(" ")}...`;
}

function updateProductResultsCount(filteredCount) {
  const totalCount = allProducts.length;
  const searchQuery = productSearch.value.trim();
  const selectedCategory = categoryFilter.value;

  if (!selectedCategory && !searchQuery) {
    productResultsCount.textContent =
      "Choose a category or type a product name to browse products.";
    return;
  }

  if (totalCount === 0) {
    productResultsCount.textContent = "Loading products...";
    return;
  }

  if (filteredCount === 0) {
    productResultsCount.textContent =
      "No products match the current search and category filters.";
    return;
  }

  const parts = [`Showing ${filteredCount} of ${totalCount} products`];

  if (selectedCategory) {
    parts.push(`in ${selectedCategory}`);
  }

  if (searchQuery) {
    parts.push(`for "${searchQuery}"`);
  }

  productResultsCount.textContent = `${parts.join(" ")}.`;
}

function matchesSearchQuery(product, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    product.name,
    product.brand,
    product.category,
    product.description,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function applyProductFilters() {
  const selectedCategory = categoryFilter.value;
  const searchQuery = productSearch.value.trim().toLowerCase();

  if (!selectedCategory && !searchQuery) {
    displayedProducts = [];
    productResultsCount.textContent =
      "Choose a category or type a product name to browse products.";
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category or search for a product to view items.
      </div>
    `;
    return;
  }

  const filteredProducts = allProducts.filter((product) => {
    const categoryMatches =
      !selectedCategory || product.category === selectedCategory;
    const searchMatches = matchesSearchQuery(product, searchQuery);

    return categoryMatches && searchMatches;
  });

  updateProductResultsCount(filteredProducts.length);
  displayProducts(filteredProducts);
}

function openProductModal(productId) {
  const product = displayedProducts.find(
    (displayedProduct) => displayedProduct.id === productId,
  );

  if (!product) {
    return;
  }

  activeModalProduct = product;
  productModalImage.src = product.image;
  productModalImage.alt = product.name;
  productModalBrand.textContent = product.brand;
  productModalTitle.textContent = product.name;
  productModalDescription.textContent = product.description;
  productModal.hidden = false;
  productModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  productModal.querySelector(".product-modal__close")?.focus();
}

function closeProductModal() {
  activeModalProduct = null;
  productModal.hidden = true;
  productModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function renderChatMessages() {
  chatWindow.innerHTML = chatUiMessages
    .map(
      (message) => `
        <div class="chat-message chat-message--${message.role}">
          <strong>${escapeHtml(message.label)}:</strong>
          <div class="chat-message__content">
            ${
              message.role === "assistant"
                ? formatAssistantContent(message.content)
                : renderTextBlocks(message.content)
            }
          </div>
        </div>
      `,
    )
    .join("");

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderSelectedProducts() {
  clearSelectionsButton.disabled = selectedProducts.size === 0;

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
      `,
    )
    .join("");
}

function saveSelectedProductsToStorage() {
  const savedProducts = Array.from(selectedProducts.values()).map(
    (product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
      image: product.image,
    }),
  );

  localStorage.setItem(savedSelectionsKey, JSON.stringify(savedProducts));
}

function loadSelectedProductsFromStorage() {
  const savedProductsJson = localStorage.getItem(savedSelectionsKey);

  if (!savedProductsJson) {
    return;
  }

  try {
    const savedProducts = JSON.parse(savedProductsJson);

    if (!Array.isArray(savedProducts)) {
      return;
    }

    savedProducts.forEach((product) => {
      if (
        product &&
        typeof product.id === "number" &&
        typeof product.name === "string" &&
        typeof product.brand === "string"
      ) {
        selectedProducts.set(product.id, product);
      }
    });
  } catch {
    localStorage.removeItem(savedSelectionsKey);
  }
}

function renderProducts(products) {
  displayedProducts = products;
  const searchQuery = productSearch.value.trim();

  if (products.length === 0) {
    const selectedCategory = categoryFilter.value;
    const hasSearchQuery = searchQuery.length > 0;
    const emptyMessage =
      selectedCategory && hasSearchQuery
        ? "No products match this category and search term."
        : selectedCategory
          ? "No products found for this category."
          : hasSearchQuery
            ? "No products match your search term."
            : "Select a category or search for a product to view items.";

    productsContainer.innerHTML = `
      <div class="placeholder-message">
        ${emptyMessage}
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
            <h3>${highlightText(product.name, searchQuery)}</h3>
            <p>${highlightText(product.brand, searchQuery)}</p>
            <p class="product-description-preview">
              ${highlightText(getDescriptionPreview(product.description), searchQuery)}
            </p>
            <button
              type="button"
              class="product-description-toggle"
              data-description-toggle="${product.id}"
              aria-haspopup="dialog"
            >
              Read details
            </button>
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

  saveSelectedProductsToStorage();
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
  saveSelectedProductsToStorage();
  renderSelectedProducts();
  renderProducts(displayedProducts);
});

clearSelectionsButton.addEventListener("click", () => {
  selectedProducts.clear();
  saveSelectedProductsToStorage();
  renderSelectedProducts();
  renderProducts(displayedProducts);
});

clearSearchButton.addEventListener("click", () => {
  productSearch.value = "";
  categoryFilter.selectedIndex = 0;
  applyProductFilters();
  productSearch.focus();
});

productModal.addEventListener("click", (event) => {
  if (event.target.hasAttribute("data-modal-close")) {
    closeProductModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !productModal.hidden) {
    closeProductModal();
  }
});

productsContainer.addEventListener("click", (event) => {
  const descriptionButton = event.target.closest(".product-description-toggle");

  if (descriptionButton) {
    event.stopPropagation();
    openProductModal(Number(descriptionButton.dataset.descriptionToggle));
    return;
  }

  const productCard = event.target.closest(".product-card");

  if (!productCard || !productsContainer.contains(productCard)) {
    return;
  }

  toggleProductSelection(Number(productCard.dataset.productId));
});

productsContainer.addEventListener("keydown", (event) => {
  const descriptionButton = event.target.closest(".product-description-toggle");

  if (descriptionButton && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openProductModal(Number(descriptionButton.dataset.descriptionToggle));
    return;
  }

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

function setChatLoadingState(isLoading) {
  userInput.disabled = isLoading;
  sendButton.disabled = isLoading;
  generateRoutineButton.disabled = isLoading;
}

async function requestAssistantReply(userMessageText, options = {}) {
  const chatMessageText = options.chatMessageText || userMessageText;
  const showUserMessage = options.showUserMessage !== false;
  const useConversationHistory = options.useConversationHistory !== false;
  const persistInConversation = options.persistInConversation !== false;

  if (!workerUrl || workerUrl.includes("YOUR-WORKER-URL")) {
    addChatMessage(
      "error",
      "Set OPENAI_WORKER_URL in config.js to your deployed Worker endpoint.",
      "Error",
    );
    return;
  }

  if (showUserMessage) {
    addChatMessage("user", chatMessageText, "You");
  }

  const userMessage = {
    role: "user",
    content: userMessageText,
  };

  let requestMessages;

  if (useConversationHistory) {
    if (persistInConversation) {
      conversationMessages.push(userMessage);
      requestMessages = [systemMessage, ...conversationMessages];
    } else {
      requestMessages = [systemMessage, ...conversationMessages, userMessage];
    }
  } else {
    requestMessages = [systemMessage, userMessage];
  }

  const loadingMessageIndex =
    chatUiMessages.push({
      role: "assistant",
      label: "Assistant",
      content: "Thinking...",
    }) - 1;

  renderChatMessages();
  setChatLoadingState(true);

  try {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: requestMessages,
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

    if (persistInConversation) {
      conversationMessages.push({
        role: "assistant",
        content: assistantReply,
      });
    }

    updateChatMessage(
      loadingMessageIndex,
      "assistant",
      assistantReply,
      "Assistant",
    );
  } catch (error) {
    updateChatMessage(loadingMessageIndex, "error", error.message, "Error");
  } finally {
    setChatLoadingState(false);
    userInput.focus();
  }
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
  if (!allProducts.length) {
    return;
  }

  applyProductFilters();
});

productSearch.addEventListener("input", () => {
  if (!allProducts.length) {
    return;
  }

  applyProductFilters();
});

async function initializeProducts() {
  allProducts = await loadProducts();
  applyProductFilters();
}

loadSelectedProductsFromStorage();
renderSelectedProducts();

initializeProducts();

/* Send the chat request to the Cloudflare Worker */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = userInput.value.trim();

  if (!message) {
    return;
  }

  userInput.value = "";
  await requestAssistantReply(message);
});

generateRoutineButton.addEventListener("click", async () => {
  if (selectedProducts.size === 0) {
    addChatMessage(
      "error",
      "Select at least one product before generating a routine.",
      "Error",
    );
    return;
  }

  const selectedProductData = Array.from(selectedProducts.values()).map(
    (product) => ({
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
    }),
  );

  const routineRequest = `Build a personalized beauty routine using only these selected products. For each step, explain why the product fits and when to use it.\n\nSelected products JSON:\n${JSON.stringify(
    selectedProductData,
    null,
    2,
  )}\n\nImportant rules:\n- Include every selected product exactly once in the routine.\n- If multiple products are in the same category, still include each one in a separate step.\n- Use product names exactly as written in the JSON.\n\nFormat your answer with this structure:\n## Routine Overview\n(1-2 short lines)\n### Morning\n1. Product Name (Brand) - how to use and why\n2. ...\n### Evening\n1. Product Name (Brand) - how to use and why\n2. ...\n### Product Coverage Checklist\n- Product Name (Brand): Included\n- Product Name (Brand): Included\n### Tips\n- ...\n- ...`;

  await requestAssistantReply(routineRequest, {
    chatMessageText:
      "Generate a personalized routine with my selected products.",
    useConversationHistory: false,
    persistInConversation: false,
  });
});
