const form = document.getElementById("analyze-form");
const statusEl = document.getElementById("status");
const resultSection = document.getElementById("result");
const chatHistoryEl = document.getElementById("chat-history");
const sendMsgBtn = document.getElementById("send-msg-btn");
const textInput = document.getElementById("text");
const demoBtnEl = document.getElementById("demo-btn");
const themeToggleBtn = document.getElementById("theme-toggle");
const modelSettingsBtn = document.getElementById("model-settings-btn");
const modelModalEl = document.getElementById("model-modal");
const closeModelModalBtn = document.getElementById("close-model-modal");
const saveModelSettingsBtn = document.getElementById("save-model-settings");
const modelOptionsEl = document.getElementById("model-options");
const activeModelBadgeEl = document.getElementById("active-model-badge");

let chatHistory = [];
let isWaiting = false;

const THEME_STORAGE_KEY = "vega-theme";
const MODEL_STORAGE_KEY = "vega-selected-model";
const MODEL_OPTIONS = [
  {
    id: "google/gemma-4-26b-a4b-it:free",
    name: "Gemma 4",
    tag: "Быстро",
    description: "Сбалансированный вариант для интервью и оценки зарплатной вилки.",
  },
  {
    id: "openai/gpt-oss-120b:free",
    name: "GPT OSS 120B",
    tag: "Подробно",
    description: "Более развернутые ответы и хорошая глубина в техническом диалоге.",
  },
  {
    id: "openrouter/owl-alpha",
    name: "Owl Alpha",
    tag: "Сильный reasoning",
    description: "Подходит для более строгих уточняющих вопросов и сложных стеков.",
  },
];

let selectedModelId = localStorage.getItem(MODEL_STORAGE_KEY) || MODEL_OPTIONS[0].id;

function getModelMeta(modelId = selectedModelId) {
  return MODEL_OPTIONS.find((option) => option.id === modelId) || MODEL_OPTIONS[0];
}

function updateModelBadge() {
  const meta = getModelMeta();
  activeModelBadgeEl.textContent = meta.name;
}

function renderModelOptions() {
  modelOptionsEl.innerHTML = MODEL_OPTIONS.map((option) => `
    <label class="model-option" data-model-id="${option.id}">
      <input type="radio" name="model-option" value="${option.id}" ${option.id === selectedModelId ? "checked" : ""}>
      <span>
        <span class="model-option__title-row">
          <span class="model-option__title">${option.name}</span>
          <span class="model-option__tag">${option.tag}</span>
        </span>
        <span class="model-option__description">${option.description}</span>
      </span>
    </label>
  `).join("");
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  themeToggleBtn.setAttribute("aria-pressed", String(theme === "light"));
  themeToggleBtn.setAttribute("title", theme === "light" ? "Включить тёмную тему" : "Включить светлую тему");
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme(savedTheme || (prefersLight ? "light" : "dark"));
}

function openModelModal() {
  renderModelOptions();
  modelModalEl.classList.remove("hidden");
  modelModalEl.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModelModal() {
  modelModalEl.classList.add("hidden");
  modelModalEl.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

initializeTheme();
updateModelBadge();

themeToggleBtn.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  applyTheme(currentTheme === "light" ? "dark" : "light");
});

modelSettingsBtn.addEventListener("click", openModelModal);
closeModelModalBtn.addEventListener("click", closeModelModal);
saveModelSettingsBtn.addEventListener("click", () => {
  const checked = modelOptionsEl.querySelector('input[name="model-option"]:checked');
  if (checked) {
    selectedModelId = checked.value;
    localStorage.setItem(MODEL_STORAGE_KEY, selectedModelId);
    updateModelBadge();
  }
  closeModelModal();
});

modelModalEl.addEventListener("click", (event) => {
  if (event.target.dataset.closeModal === "true") {
    closeModelModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modelModalEl.classList.contains("hidden")) {
    closeModelModal();
  }
});

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = (textarea.scrollHeight) + 'px';
}

textInput.addEventListener('input', function() {
  autoResizeTextarea(this);
});

function addMessageToChat(role, content) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `chat-message ${role}`;
  
  const avatarDiv = document.createElement("div");
  avatarDiv.className = "chat-avatar";
  avatarDiv.textContent = role === "user" ? "Вы" : "AI";
  
  const contentDiv = document.createElement("div");
  contentDiv.className = "chat-content";
  if (role === "assistant") {
    contentDiv.innerHTML = marked.parse(content);
  } else {
    contentDiv.textContent = content;
  }
  
  msgDiv.appendChild(avatarDiv);
  msgDiv.appendChild(contentDiv);
  
  chatHistoryEl.appendChild(msgDiv);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

sendMsgBtn.addEventListener("click", async () => {
  if (isWaiting) return;
  const text = textInput.value.trim();
  if (!text) return;

  isWaiting = true;
  addMessageToChat("user", text);
  textInput.value = "";
  
  // Disable input while waiting
  textInput.disabled = true;
  sendMsgBtn.disabled = true;
  
  try {
    // Добавляем индикатор печати
    const typingIndicator = document.createElement("div");
    typingIndicator.className = "chat-message assistant typing-indicator";
    typingIndicator.id = "typing-indicator";
    const avatarDiv = document.createElement("div");
    avatarDiv.className = "chat-avatar";
    const contentDiv = document.createElement("div");
    contentDiv.className = "chat-content";
    contentDiv.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    typingIndicator.appendChild(avatarDiv);
    typingIndicator.appendChild(contentDiv);
    chatHistoryEl.appendChild(typingIndicator);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, chat_history: chatHistory, model: selectedModelId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Ошибка на сервере" }));
      throw new Error(errorData.detail || "Ошибка на сервере");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;
    let assistantMessage = "";

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        assistantMessage += chunk;
        
        let displayText = assistantMessage;
        if (displayText.includes("[ИНТЕРВЬЮ ЗАВЕРШЕНО]")) {
          displayText = displayText.replace("[ИНТЕРВЬЮ ЗАВЕРШЕНО]", "").trim();
        }
        
        // Как только пришел первый текст, убираем точки и рендерим markdown
        if (assistantMessage.length > 0) {
          contentDiv.innerHTML = marked.parse(displayText);
          // Удаляем класс typing-indicator чтобы он не вел себя как анимация, если это нужно
          typingIndicator.classList.remove("typing-indicator");
          typingIndicator.removeAttribute("id");
        }
        
        chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
      }
    }

    const isFinished = assistantMessage.includes("[ИНТЕРВЬЮ ЗАВЕРШЕНО]");
    if (isFinished) {
      assistantMessage = assistantMessage.replace("[ИНТЕРВЬЮ ЗАВЕРШЕНО]", "").trim();
      contentDiv.innerHTML = marked.parse(assistantMessage);
    }
    
    // Add both messages to history
    chatHistory.push({ role: "user", content: text });
    chatHistory.push({ role: "assistant", content: assistantMessage });

    if (isFinished) {
      // Automatically trigger the analysis
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  } catch (error) {
    statusEl.textContent = `Ошибка: ${error.message}`;
    // Remove typing indicator on error
    const indicator = document.getElementById("typing-indicator");
    if (indicator) indicator.remove();
  } finally {
    textInput.disabled = false;
    sendMsgBtn.disabled = false;
    textInput.focus();
    isWaiting = false;
  }
});

// Optionally support enter to send
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!isWaiting) {
      sendMsgBtn.click();
    }
  }
});

// Demo button handler
demoBtnEl.addEventListener("click", (e) => {
  e.preventDefault();
  
  const demoData = {
    profile_title: "Senior Python Developer",
    min_salary: 150000,
    max_salary: 250000,
    average_salary: 195000,
    vacancies_found: 5,
    skills: ["Python", "FastAPI", "PostgreSQL", "Docker", "AWS"],
    additional_skills: ["Kubernetes", "Redis", "Celery", "GraphQL", "Microservices"],
    development_plan: [
      "Углубить знания Kubernetes и DevOps практик",
      "Изучить архитектуру микросервисов",
      "Развить навыки лидерства и менторства",
      "Освоить новые облачные технологии (GCP, Azure)"
    ],
    salary_values: [
      {
        salary_from: 160000,
        salary_to: 220000,
        currency: "RUR",
        vacancy_title: "Senior Python Developer",
        vacancy_url: "https://hh.ru/vacancy/example1",
        employer_name: "Компания А"
      },
      {
        salary_from: 150000,
        salary_to: 240000,
        currency: "RUR",
        vacancy_title: "Lead Python Engineer",
        vacancy_url: "https://hh.ru/vacancy/example2",
        employer_name: "Компания Б"
      },
      {
        salary_from: 170000,
        salary_to: 260000,
        currency: "RUR",
        vacancy_title: "Backend Architect",
        vacancy_url: "https://hh.ru/vacancy/example3",
        employer_name: "Компания В"
      },
      {
        salary_from: 140000,
        salary_to: 210000,
        currency: "RUR",
        vacancy_title: "Python Backend Developer",
        vacancy_url: "https://hh.ru/vacancy/example4",
        employer_name: "Компания Г"
      },
      {
        salary_from: 155000,
        salary_to: 235000,
        currency: "RUR",
        vacancy_title: "Senior Software Engineer",
        vacancy_url: "https://hh.ru/vacancy/example5",
        employer_name: "Компания Д"
      }
    ]
  };
  
  statusEl.textContent = "Демонстрация результатов анализа";
  form.parentElement.classList.add("hidden");
  renderResult(demoData);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = textInput.value.trim();

  if (chatHistory.length === 0 && !text) {
    statusEl.textContent = "Пожалуйста, начните диалог или введите навыки.";
    return;
  }

  // Проверяем минимальную длину ввода если нет истории
  if (chatHistory.length === 0) {
    const cleanInput = text.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, "").trim();
    if (cleanInput.length < 3) {
      statusEl.textContent = "Пожалуйста, укажите больше информации. Минимум 3 буквы/цифры.";
      return;
    }
  }

  statusEl.textContent = "Идет итоговый анализ рынка... Вычисление вилки.";
  resultSection.classList.add("hidden");

  try {
    const requestBody = { 
      text: text || "Оцени мои навыки на основе нашего диалога.", 
      chat_history: chatHistory,
      model: selectedModelId,
    };

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Ошибка на сервере");
    }

    const data = await response.json();
    renderResult(data);
    statusEl.textContent = "Анализ завершен.";
    form.parentElement.classList.add("hidden");
  } catch (error) {
    statusEl.textContent = `Ошибка: ${error.message}`;
  }
});

function renderResult(data) {
  resultSection.classList.remove("hidden");

  // Форматируем результаты в красивый вид
  const minSalary = data.min_salary ? Math.round(data.min_salary) : 0;
  const maxSalary = data.max_salary ? Math.round(data.max_salary) : 0;
  const avgSalary = data.average_salary ? Math.round(data.average_salary) : 0;

  // Используем предоставленное бэкендом название профиля или фоллбэк
  let profileTitle = data.profile_title || "Профиль: ";
  if (!data.profile_title) {
    if (maxSalary > 150000) {
      profileTitle += "Senior ";
    } else if (maxSalary > 100000) {
      profileTitle += "Middle/Senior ";
    } else if (maxSalary > 80000) {
      profileTitle += "Junior+/Middle ";
    } else {
      profileTitle += "Junior ";
    }
    
    // Добавляем первый навык в название профиля
    if (data.skills.length > 0) {
      const firstSkill = data.skills[0];
      profileTitle += firstSkill;
    }
  }

  // Обновляем результаты
  const resultCard = resultSection.querySelector(".result-card");
  resultCard.innerHTML = `
    <div class="results-header">
      <h2>${profileTitle}</h2>
      <button type="button" class="new-analysis-btn">Новый анализ</button>
    </div>
    
    <div class="market-assessment">
      <p><strong>Оценка рынка:</strong> ${minSalary.toLocaleString("ru-RU")} - ${maxSalary.toLocaleString("ru-RU")} рублей</p>
    </div>

    <div class="result-block">
      <div class="block-header">
        <h3>Сильные навыки:</h3>
        <button class="collapse-btn" aria-expanded="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>
      <ul class="skills-list block-content">
        ${data.skills
          .slice(0, 5)
          .map((skill) => `<li>- ${skill}</li>`)
          .join("")}
      </ul>
    </div>

    <div class="result-block">
      <div class="block-header">
        <h3>Часто требуют дополнительно:</h3>
        <button class="collapse-btn" aria-expanded="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>
      <ul class="additional-skills block-content">
        ${(data.additional_skills || data.development_plan)
          .slice(0, 5)
          .map((item) => {
            const cleanItem = item.replace(/^\d+\.\s+/, "");
            return `<li>- ${cleanItem}</li>`;
          })
          .join("")}
      </ul>
    </div>

    <div class="result-block">
      <div class="block-header">
        <h3>Что может поднять вилку:</h3>
        <button class="collapse-btn" aria-expanded="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>
      <ol class="salary-boost block-content">
        ${data.development_plan
          .slice(0, 4)
          .map((item) => {
            const cleanItem = item.replace(/^\d+\.\s+/, "");
            return `<li>${cleanItem}</li>`;
          })
          .join("")}
      </ol>
    </div>

    <div class="result-block">
      <div class="block-header">
        <h3>Статистика вакансий:</h3>
        <button class="collapse-btn" aria-expanded="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>
      <div class="stats-grid block-content">
        <div class="stat-item">
          <span>Вакансий найдено</span>
          <strong>${data.vacancies_found}</strong>
        </div>
        <div class="stat-item">
          <span>Минимальная зарплата</span>
          <strong>${minSalary.toLocaleString("ru-RU")} ₽</strong>
        </div>
        <div class="stat-item">
          <span>Средняя зарплата</span>
          <strong>${avgSalary.toLocaleString("ru-RU")} ₽</strong>
        </div>
        <div class="stat-item">
          <span>Максимальная зарплата</span>
          <strong>${maxSalary.toLocaleString("ru-RU")} ₽</strong>
        </div>
      </div>
    </div>

    <div class="result-block">
      <div class="block-header">
        <h3>График зарплат по вакансиям</h3>
        <button class="collapse-btn" aria-expanded="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>
      <div id="chart" class="chart-placeholder block-content"></div>
    </div>

    <div class="result-block">
      <div class="block-header">
        <h3>Подходящие вакансии на hh.ru</h3>
        <button class="collapse-btn" aria-expanded="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>
      <ul id="vacancies-list" class="vacancies-list block-content">
        ${data.salary_values
          .filter(v => v.vacancy_url)
          .map((v, index) => {
            const salary = v.salary_to ? `${Math.round(v.salary_to).toLocaleString("ru-RU")}₽` : "—";
            return `
              <li class="vacancy-item">
                <a href="${v.vacancy_url}" target="_blank" class="vacancy-link" rel="noopener noreferrer">
                  <strong>${v.vacancy_title || `Вакансия ${index + 1}`}</strong>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="external-link-icon">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
                <div class="vacancy-details">
                  <span class="employer">${v.employer_name || "Компания"}</span>
                  <span class="salary">${salary}</span>
                </div>
              </li>
            `;
          })
          .join("")}
      </ul>
    </div>
  `;

  // Добавляем обработчики для кнопок collapse
  const collapseButtons = resultCard.querySelectorAll(".collapse-btn");
  collapseButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const content = btn.closest(".block-header").nextElementSibling;
      const isExpanded = btn.getAttribute("aria-expanded") === "true";
      
      if (isExpanded) {
        content.style.display = "none";
        btn.setAttribute("aria-expanded", "false");
        btn.classList.add("collapsed");
      } else {
        content.style.display = "";
        btn.setAttribute("aria-expanded", "true");
        btn.classList.remove("collapsed");
      }
    });
  });

  // Обработчик для кнопки "Новый анализ"
  const newAnalysisBtn = resultCard.querySelector(".new-analysis-btn");
  if (newAnalysisBtn) {
    newAnalysisBtn.addEventListener("click", (e) => {
      e.preventDefault();
      form.parentElement.classList.remove("hidden");
      resultSection.classList.add("hidden");
      textInput.focus();
      textInput.value = "";
    });
  }

  renderChart(data.salary_values);
}

function renderChart(salaryValues) {
  const chartEl = document.getElementById("chart");
  if (!chartEl) return;

  if (!salaryValues.length) {
    chartEl.textContent = "Нет данных для графика.";
    return;
  }

  const prepared = salaryValues
    .map((item, index) => {
      const from = item.salary_from || item.salary_to || 0;
      const to = item.salary_to || item.salary_from || 0;
      return { label: `Вак. ${index + 1}`, from, to };
    })
    .slice(0, 6); // Показываем максимум 6 вакансий для лучшей читаемости

  chartEl.innerHTML = "";
  const maxValue = Math.max(...prepared.map((item) => Math.max(item.from, item.to)));

  prepared.forEach((item) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    
    // Лейбл
    const label = document.createElement("div");
    label.className = "chart-label";
    label.textContent = item.label;

    // Контейнер для бара и текста
    const barContainer = document.createElement("div");
    barContainer.style.display = "flex";
    barContainer.style.alignItems = "center";
    barContainer.style.gap = "8px";

    // Bar wrapper
    const barWrapper = document.createElement("div");
    barWrapper.className = "chart-bar-wrapper";
    barWrapper.style.flex = "1";
    barWrapper.style.minWidth = "100px";

    const bar = document.createElement("div");
    bar.className = "chart-bar";
    const barWidth = maxValue ? Math.round((item.to / maxValue) * 100) : 0;
    bar.style.width = `${barWidth}%`;
    bar.style.minWidth = "40px"; // Минимальная ширина для читаемости
    bar.style.display = "flex";
    bar.style.alignItems = "center";
    bar.style.justifyContent = "center";
    bar.textContent = item.to ? `${Math.round(item.to)}₽` : "—";

    barWrapper.appendChild(bar);
    barContainer.appendChild(barWrapper);

    // Текст с диапазоном
    const rangeText = document.createElement("div");
    rangeText.style.fontSize = "0.85rem";
    rangeText.style.color = "#cbd5e1";
    rangeText.style.minWidth = "100px";
    rangeText.style.textAlign = "right";
    
    if (item.from && item.to && item.from !== item.to) {
      rangeText.textContent = `${Math.round(item.from)} - ${Math.round(item.to)}`;
    } else {
      rangeText.textContent = item.to ? `${Math.round(item.to)}` : "—";
    }
    
    barContainer.appendChild(rangeText);

    row.appendChild(label);
    row.appendChild(barContainer);
    chartEl.appendChild(row);
  });
}
