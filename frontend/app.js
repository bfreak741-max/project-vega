const form = document.getElementById("analyze-form");
const statusEl = document.getElementById("status");
const resultSection = document.getElementById("result");
const chatHistoryEl = document.getElementById("chat-history");
const sendMsgBtn = document.getElementById("send-msg-btn");
const textInput = document.getElementById("text");

let chatHistory = [];
let isWaiting = false;

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
      body: JSON.stringify({ text, chat_history: chatHistory }),
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
      chat_history: chatHistory
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
    <h2>${profileTitle}</h2>
    
    <div class="market-assessment">
      <p><strong>Оценка рынка:</strong> ${minSalary.toLocaleString("ru-RU")} - ${maxSalary.toLocaleString("ru-RU")} рублей</p>
    </div>

    <div class="result-block">
      <h3>Сильные навыки:</h3>
      <ul class="skills-list">
        ${data.skills
          .slice(0, 5)
          .map((skill) => `<li>- ${skill}</li>`)
          .join("")}
      </ul>
    </div>

    <div class="result-block">
      <h3>Часто требуют дополнительно:</h3>
      <ul class="additional-skills">
        ${data.development_plan
          .slice(0, 5)
          .map((item) => {
            // Убираем нумерацию если есть
            const cleanItem = item.replace(/^\d+\.\s+/, "");
            return `<li>- ${cleanItem}</li>`;
          })
          .join("")}
      </ul>
    </div>

    <div class="result-block">
      <h3>Что может поднять вилку:</h3>
      <ol class="salary-boost">
        ${data.development_plan
          .slice(0, 4)
          .map((item) => {
            // Убираем нумерацию если есть
            const cleanItem = item.replace(/^\d+\.\s+/, "");
            return `<li>${cleanItem}</li>`;
          })
          .join("")}
      </ol>
    </div>

    <div class="result-block">
      <h3>Статистика вакансий:</h3>
      <div class="stats-grid">
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
      <h3>График зарплат по вакансиям</h3>
      <div id="chart" class="chart-placeholder"></div>
    </div>
  `;

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
