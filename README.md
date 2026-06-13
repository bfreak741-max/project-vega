# Сколько я стою?

Простой проект на Python + FastAPI и чистом HTML/CSS/JS для анализа навыков, рынка вакансий и генерации рекомендаций.

## Поддерживаемые LLM провайдеры

- **OpenRouter** (Nemotron-3-Ultra-550B) — бесплатный и быстрый, по умолчанию
- **OpenAI** (GPT-3.5-turbo) — платный вариант

## Архитектура приложения

1. Пользователь заполняет форму во фронтенде в `frontend/index.html`.
2. Vanilla JavaScript (`frontend/app.js`) отправляет POST-запрос на бэкенд `/api/analyze`.
3. Бэкенд `backend/app.py`:
   - обращается к HeadHunter API и загружает вакансии по ключевым словам;
   - собирает поля `salary.from` и `salary.to`;
   - вычисляет среднюю, минимальную и максимальную зарплату;
   - отправляет текст и навыки в LLM (OpenRouter или OpenAI) для извлечения навыков и плана развития;
   - возвращает JSON-ответ с аналитикой и рекомендациями.
4. Фронтенд отображает результаты: зарплатную вилку, список навыков, план развития и условный график.

## Структура проекта

```
Сколько я стою?/
├── backend/
│   ├── app.py
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── README.md
```

## Запуск локально

### Вариант 1: С OpenRouter (рекомендуется)

1. Перейти в папку проекта:
```powershell
cd "c:\Users\levab\Desktop\Новая папка"
```

2. Создать виртуальное окружение:
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r backend\requirements.txt
```

3. Получить API ключ на openrouter.ai и установить переменную:
```powershell
$env:OPENROUTER_API_KEY = "ваш_ключ_openrouter"
$env:LLM_PROVIDER = "openrouter"
```

4. Запустить сервер:
```powershell
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

5. Открыть в браузере:
```
http://127.0.0.1:8000
```

### Вариант 2: С OpenAI

1. Установить окружение (шаги 1-2 как выше):
```powershell
cd "c:\Users\levab\Desktop\Новая папка"
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r backend\requirements.txt
```

2. Установить ключи OpenAI:
```powershell
$env:OPENAI_API_KEY = "ваш_api_ключ_openai"
$env:LLM_PROVIDER = "openai"
```

3. Запустить:
```powershell
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

## Деплой на Ubuntu в Cloud.ru

### С OpenRouter

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip

cd /path/to/project

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt

export OPENROUTER_API_KEY="ваш_ключ_openrouter"
export LLM_PROVIDER="openrouter"

uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

### С OpenAI

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip

cd /path/to/project

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt

export OPENAI_API_KEY="ваш_api_ключ_openai"
export LLM_PROVIDER="openai"

uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

## Получение API ключей

### OpenRouter

1. Перейти на https://openrouter.ai
2. Зарегистрироваться или войти
3. Перейти в **API Keys**
4. Скопировать ключ
5. Модель `nvidia/nemotron-3-ultra-550b-a55b:free` в бесплатном тарифе имеет лимиты, но отлично подходит для разработки

### OpenAI

1. Перейти на https://platform.openai.com/api-keys
2. Создать новый API key
3. Скопировать ключ
4. Добавить баланс на счёт (платный сервис)

## Как работает бэкенд

- `backend/app.py` создаёт FastAPI-приложение.
- Эндпоинт `POST /api/analyze` принимает JSON с полями `text`, `region`, `employment_type`.
- Функция `search_hh_vacancies` ищет вакансии на HeadHunter с нужным регионом и ключевыми словами.
- `extract_salary` вытаскивает поля `salary.from`, `salary.to`, `currency`.
- `calculate_salary_statistics` считает среднее, минимальное и максимальное значение.
- `call_llm` выбирает между `call_openrouter` или `call_openai` на основе `LLM_PROVIDER`.

## Трублшутинг

### Ошибка "Failed to execute 'json' on 'Response': Unexpected end of JSON input"

Это происходит когда сервер возвращает пустой ответ. Причины:
- **Неправильный API ключ** — проверьте переменную окружения
- **Лимиты API** — у бесплатной модели OpenRouter есть ограничения
- **Проблемы с сетью** — проверьте подключение
- **Ошибка сервера** — посмотрите логи в консоли

Решение:
1. Проверьте, что API ключ установлен:
   ```powershell
   $env:OPENROUTER_API_KEY  # или $env:OPENAI_API_KEY
   ```
2. Посмотрите логи в консоли при запуске `uvicorn`
3. Если используется бесплатная модель OpenRouter, дождитесь сброса лимитов

## Примечание

- `region` в HH API передаётся кодом региона (`1` — Москва, `2` — Санкт-Петербург и т.д.).
- Если хочешь, можно добавить:
  - реальную карту вакансий,
  - фильтр по опыту,
  - поддержку нескольких языков,
  - сохранение истории запросов.
