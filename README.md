# Сколько я стою?

Веб-приложение для анализа IT-навыков, рыночных зарплат и построения плана развития. Пользователь проходит диалоговое интервью с ИИ-рекрутером, который задаёт уточняющие вопросы, определяет уровень и стек, а затем выдаёт аналитику на основе реальных вакансий с HeadHunter.

## Стек технологий

| Слой | Технологии |
|------|-----------|
| Бэкенд | Python 3.12, FastAPI, Uvicorn, Pydantic |
| Фронтенд | HTML5, CSS3 (CSS Custom Properties), Vanilla JavaScript |
| ИИ | OpenRouter API (Google Gemma 4, GPT OSS 120B, Owl Alpha) |
| API данных | HeadHunter API (вакансии и зарплаты) |
| Управление пакетами | uv (pyproject.toml, uv.lock) |

## Архитектура

```
Пользователь
    │
    ▼
┌─────────────────────────────────────────┐
│  Фронтенд (index.html + app.js + CSS)  │
│  • Чат-интервью с ИИ (стриминг)        │
│  • Выбор модели, темы                   │
│  • Отображение результатов анализа      │
└──────────────┬──────────────────────────┘
               │ POST /api/chat (стриминг)
               │ POST /api/analyze
               ▼
┌─────────────────────────────────────────┐
│  Бэкенд (FastAPI — backend/app.py)      │
│                                         │
│  1. /api/chat — стриминговый диалог     │
│     с LLM (рекрутер-интервьюер)         │
│                                         │
│  2. /api/analyze — итоговый анализ:     │
│     • Извлечение навыков из диалога     │
│     • Извлечение фильтров (город,       │
│       формат, опыт)                     │
│     • Запрос вакансий в HH API          │
│     • Расчёт зарплатной статистики      │
│     • Генерация плана развития (LLM)    │
│     • Определение профиля/грейда (LLM)  │
│     • Определение доп.навыков (LLM)     │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
  HeadHunter API    OpenRouter / OpenAI
  (вакансии)        (LLM модели)
```

## Как это работает

1. **Диалог с ИИ-рекрутером.** Пользователь отправляет описание своих навыков. LLM выступает в роли технического интервьюера — задаёт уточняющие вопросы о стеке, опыте, формате работы, регионе.
2. **Автозавершение.** Когда LLM считает, что информации достаточно, он завершает диалог маркером `[ИНТЕРВЬЮ ЗАВЕРШЕНО]`. Фронтенд автоматически запускает анализ.
3. **Анализ рынка.** Бэкенд извлекает навыки и фильтры из диалога, ищет вакансии в HeadHunter, считает зарплатную статистику.
4. **Генерация рекомендаций.** LLM определяет профиль/грейд, составляет план развития и список дополнительных навыков.
5. **Визуализация.** Результаты отображаются: зарплатная вилка, диаграмма по вакансиям, сильные навыки, план развития, ссылки на вакансии.

## Структура проекта

```
project-vega-main/
├── backend/
│   └── app.py              # FastAPI-приложение: API, HH-интеграция, LLM-вызовы
├── frontend/
│   ├── index.html           # Главная страница (чат-интерфейс, модалки)
│   ├── style.css            # Стили (тёмная/светлая тема, адаптив)
│   └── app.js               # Клиентская логика (чат, стриминг, рендер результатов)
├── .env                     # API-ключи (не коммитить!)
├── .gitignore
├── .python-version          # 3.12.10
├── pyproject.toml           # Зависимости и конфигурация проекта
├── uv.lock                  # Лок файл для uv
└── README.md
```

## Быстрый старт

### Требования

- Python 3.12
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (рекомендуется) или pip
- API-ключ OpenRouter (бесплатный) или OpenAI

### Установка и запуск

```bash
# 1. Клонировать/открыть проект
cd project-vega-main

# 2. Создать виртуальное окружение и установить зависимости
uv sync

# Или через pip:
# python -m venv venv
# source venv/bin/activate  # Linux/macOS
# .\venv\Scripts\Activate.ps1  # Windows
# pip install -r backend/requirements.txt

# 3. Настроить переменные окружения
# Создайте файл .env или задайте переменные:
#   OPENROUTER_API_KEY=sk-or-v1-...
#   LLM_PROVIDER=openrouter

# 4. Запустить сервер
uv run uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000

# 5. Открыть в браузере
# http://localhost:8000
```

### Через pip (без uv)

```bash
cd project-vega-main
python -m venv venv
source venv/bin/activate        # Linux/macOS
.\venv\Scripts\Activate.ps1     # Windows
pip install fastapi==0.111.1 uvicorn[standard]==0.24.0 requests==2.31.0 pydantic==2.11.0 python-dotenv

export OPENROUTER_API_KEY="sk-or-v1-..."
export LLM_PROVIDER="openrouter"

uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

## Переменные окружения

| Переменная | Обязательна | Описание | По умолчанию |
|-----------|-------------|----------|--------------|
| `OPENROUTER_API_KEY` | Да (для OpenRouter) | API-ключ OpenRouter | — |
| `OPENAI_API_KEY` | Да (для OpenAI) | API-ключ OpenAI | — |
| `LLM_PROVIDER` | Нет | Провайдер LLM: `openrouter` или `openai` | `openrouter` |
| `OPENROUTER_MODEL` | Нет | Модель OpenRouter по умолчанию | `google/gemma-4-26b-a4b-it:free` |

## Поддерживаемые LLM модели

Модель выбирается пользователем прямо из интерфейса (кнопка «Модель» в шапке):

| Модель | ID | Описание |
|--------|----|----------|
| Gemma 4 | `google/gemma-4-26b-a4b-it:free` | Быстрый, сбалансированный (по умолчанию) |
| GPT OSS 120B | `openai/gpt-oss-120b:free` | Подробные ответы, глубокий технический диалог |
| Owl Alpha | `openrouter/owl-alpha` | Сильный reasoning для сложных стеков |

## API эндпоинты

### `POST /api/chat`

Стриминговый чат с LLM-рекрутером.

**Request:**
```json
{
  "text": "Python, 3 года опыта, Django и FastAPI",
  "chat_history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "model": "google/gemma-4-26b-a4b-it:free"
}
```

**Response:** `text/plain` (стриминг чанков текста)

---

### `POST /api/analyze`

Полный анализ: навыки + вакансии + зарплаты + план развития.

**Request:**
```json
{
  "text": "Python FastAPI Docker PostgreSQL",
  "chat_history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "model": "google/gemma-4-26b-a4b-it:free",
  "region": "1",
  "schedule": "remote",
  "employment": "full",
  "experience": "between3And6",
  "part_time": "",
  "vacancy_count": 50
}
```

**Response:**
```json
{
  "average_salary": 180000,
  "min_salary": 120000,
  "max_salary": 250000,
  "vacancies_found": 5,
  "salary_values": [
    {
      "salary_from": 120000,
      "salary_to": 200000,
      "currency": "RUR",
      "vacancy_title": "Senior Python Developer",
      "vacancy_url": "https://hh.ru/vacancy/...",
      "employer_name": "Компания"
    }
  ],
  "skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
  "additional_skills": ["Kubernetes", "Redis", "Celery"],
  "development_plan": [
    "Изучить Kubernetes и Docker Compose",
    "Освоить AWS/GCP для деплоя"
  ],
  "profile_title": "Senior Python Developer",
  "message": "Анализ выполнен успешно."
}
```

## Возможности фронтенда

- **Чат-интерфейс** — диалог с ИИ-рекрутером в реальном времени (стриминг ответов)
- **Выбор LLM модели** — модальное окно с тремя вариантами, выбор сохраняется в `localStorage`
- **Тёмная и светлая тема** — переключение по кнопке, автоопределение системных предпочтений
- **Адаптивная верстка** — корректно работает на мобильных устройствах
- **Сворачиваемые блоки** — каждый раздел результатов можно свернуть/развернуть
- **Демо-режим** — кнопка «Показать пример результата» для ознакомления без API
- **График зарплат** — горизонтальная столбчатая диаграмма по вакансиям
- **Ссылки на вакансии** — прямые ссылки на вакансии hh.ru с указанием зарплаты и работодателя
- **Кнопка «Новый анализ»** — возврат к диалогу для нового запроса

## Деплой

### Ubuntu / Cloud.ru

```bash
# Установка зависимостей
sudo apt update && sudo apt install -y python3 python3-venv python3-pip

cd /path/to/project
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install fastapi==0.111.1 uvicorn[standard]==0.24.0 requests==2.31.0 pydantic==2.11.0 python-dotenv

# Настройка переменных окружения
export OPENROUTER_API_KEY="sk-or-v1-..."
export LLM_PROVIDER="openrouter"

# Запуск (без --reload в продакшене)
uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

### systemd-сервис (продакшен)

```ini
# /etc/systemd/system/vega.service
[Unit]
Description=Project Vega - Salary Analysis
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/project-vega-main
Environment="OPENROUTER_API_KEY=sk-or-v1-..."
Environment="LLM_PROVIDER=openrouter"
ExecStart=/opt/project-vega-main/venv/bin/uvicorn backend.app:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable vega
sudo systemctl start vega
```

## Получение API ключей

### OpenRouter (рекомендуется — бесплатно)

1. Зарегистрируйтесь на [openrouter.ai](https://openrouter.ai)
2. Перейдите в **API Keys**
3. Создайте и скопируйте ключ
4. Бесплатные модели имеют лимиты по запросам, но подходят для разработки

### OpenAI (платный)

1. Перейдите на [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Создайте API key
3. Добавьте баланс на счёт

## Как работает бэкенд

### Основные компоненты `backend/app.py`

| Функция | Назначение |
|---------|-----------|
| `search_hh_vacancies()` | Поиск вакансий в HH API с фильтрами (регион, формат, опыт) |
| `extract_salary()` | Извлечение `salary.from`, `salary.to`, `currency` из вакансии |
| `calculate_salary_statistics()` | Расчёт средней, минимальной и максимальной зарплаты |
| `call_llm()` | Маршрутизация запросов к OpenRouter или OpenAI |
| `call_openrouter()` | Запрос к OpenRouter API с поддержкой стриминга |
| `is_valid_input()` | Валидация входных данных (наличие IT-технологий и контекста) |
| `clean_llm_list_output()` | Парсинг нумерованных списков из ответов LLM |
| `generate_mock_vacancies()` | Генерация тестовых данных, если HH API недоступен |

### Промпты LLM

- **SYSTEM_PROMPT** — роль технического интервьюера: задаёт вопросы, определяет уровень, не раскрывает результаты в чате
- `build_skill_extraction_prompt()` — извлечение навыков из текста диалога
- `build_filters_extraction_prompt()` — извлечение фильтров (город, формат, опыт) в формате JSON
- `build_development_plan_prompt()` — генерация плана развития (4-6 шагов)
- `build_additional_skills_prompt()` — определение дополнительных навыков для thị trường
- `build_profile_title_prompt()` — определение должности и грейда

### Валидация ввода

Бэкенд проверяет, что пользователь указал достаточно информации:
- Минимум одна IT-технология из каталога (100+ технологий)
- Для одной технологии — обязательно указание опыта или уровня
- Для двух+ технологий — дополнительный контекст не требуется

## Регионы HeadHunter

| Код | Регион |
|-----|--------|
| 1 | Москва |
| 2 | Санкт-Петербург |
| 113 | Россия (все регионы) |
| 40 | Екатеринбург |
| 76 | Казань |
| 53 | Новосибирск |

## Траблшутинг

### Пустой ответ от сервера / ошибка парсинга JSON

**Причины:** неверный API-ключ, лимиты API, проблемы с сетью.

**Решение:**
1. Проверьте переменные окружения:
   ```bash
   echo $OPENROUTER_API_KEY    # Linux/macOS
   $env:OPENROUTER_API_KEY     # Windows PowerShell
   ```
2. Смотрите логи в консоли uvicorn
3. Проверьте баланс/лимиты на сайте провайдера

### Ошибка "Отсутствует ключ OPENROUTER_API_KEY"

Убедитесь, что переменная задана перед запуском uvicorn. Задать можно через `.env` файл в корне проекта.

### HH API не возвращает вакансии

- Проверьте подключение к интернету
- HH API может блокировать запросы без User-Agent (приложение отправляет его автоматически)
- При недоступности API автоматически используются mock-данные

## Лицензия

Проект предназначен для образовательных и личных целей.
