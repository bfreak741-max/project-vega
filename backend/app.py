from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import requests
import json
import os
from pathlib import Path
from typing import List, Optional, Dict, Any
import time
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("app_logger")

app = FastAPI(title="Сколько я стою?", version="0.1")
project_root = Path(__file__).resolve().parent.parent
frontend_dir = project_root / "frontend"

SYSTEM_PROMPT = """Ты — опытный IT-рекрутер и технический эксперт. Твоя цель — провести техническое интервью в формате диалога.
Пользователь дает тебе первичный промпт — свое резюме или просто описание своих навыков (оно может быть кратким, неточным или неполным).
Твоя задача в условиях диалога за 5-10 сообщений (задавая 1-2 вопроса за одну реплику) подобрать конкретный стек пользователя, подходящие ему вакансии и зарплатную вилку.

Правила поведения:
1. Задавай уточняющие и каверзные технические вопросы по упомянутому стеку, чтобы проверить реальный опыт (Junior, Middle, Senior, Lead).
2. Обязательно (но ненавязчиво, в ходе беседы) выясни предпочтения кандидата по формату работы:
   - В каком регионе или городе он ищет работу?
   - Какой формат: удаленка, офис, гибрид?
   - Какая занятость: полный день, подработка, стажировка?
   - Сколько у него лет коммерческого опыта?
3. Веди диалог последовательно, не вываливай сразу все вопросы. 
4. Копай вглубь: выясняй не только хард-скиллы, но и масштаб проектов, зону ответственности, сложные задачи.
5. Когда ты соберешь достаточно информации (обычно через 5-10 сообщений) и поймешь уровень кандидата, заверши диалог короткой финальной фразой (например: "Отлично, я собрал всю нужную информацию. Сейчас я проанализирую реальные вакансии и подготовлю для тебя итоговый отчет.").
   - Внимание: НЕ подводи итоги в чате! НЕ пиши никаких зарплатных вилок, стеков, названий профиля и планов развития в самом диалоге! Все эти данные будут сгенерированы системой отдельно на основе реальных данных с HeadHunter. Твоя задача в чате — только собрать информацию.
   - В самом конце этой короткой финальной фразы ОБЯЗАТЕЛЬНО напиши кодовое слово "[ИНТЕРВЬЮ ЗАВЕРШЕНО]" (именно в квадратных скобках), чтобы система автоматически перешла к детальному анализу рынка.

До тех пор, пока информации недостаточно для точной оценки, продолжай задавать вопросы и НЕ ПИШИ это кодовое слово. Не выходи из роли технического интервьюера."""

# --- Схема данных, которую ожидает бэкенд от фронтенда ---
class AnalyzeRequest(BaseModel):
    text: str
    region: str
    employment_type: str
    vacancy_count: Optional[int] = 50

# --- Модель для данных о зарплате и вакансии ---
class SalaryData(BaseModel):
    salary_from: Optional[float] = None
    salary_to: Optional[float] = None
    currency: Optional[str] = None
    vacancy_title: Optional[str] = None
    vacancy_url: Optional[str] = None
    employer_name: Optional[str] = None

# --- Ответная схема с аналитикой и рекомендациями ---
class AnalyzeResponse(BaseModel):
    average_salary: Optional[float]
    min_salary: Optional[float]
    max_salary: Optional[float]
    vacancies_found: int
    salary_values: List[SalaryData]
    skills: List[str]
    additional_skills: List[str]
    development_plan: List[str]
    message: str
    profile_title: Optional[str] = None

# Добавляем схему для одного сообщения в диалоге
class ChatMessage(BaseModel):
    role: str  # 'user' или 'assistant'
    content: str

class ChatRequest(BaseModel):
    text: str
    chat_history: Optional[List[ChatMessage]] = []
    model: Optional[str] = None

class ChatResponse(BaseModel):
    message: str

class AnalyzeRequest(BaseModel):
    text: str # Последнее сообщение пользователя
    chat_history: Optional[List[ChatMessage]] = [] # История предыдущего диалога
    model: Optional[str] = None
    region: str = "1"
    schedule: str = ""
    employment: str = ""
    experience: str = ""
    part_time: str = ""
    vacancy_count: Optional[int] = 50

HH_API_URL = "https://api.hh.ru/vacancies"
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

# Выбор провайдера LLM: 'openrouter' или 'openai'
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openrouter")
DEFAULT_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemma-4-26b-a4b-it:free")

# --- КОНКРЕТНЫЕ IT-ТЕХНОЛОГИИ (основной критерий) ---
TECH_KEYWORDS = {
    # Языки программирования
    "python", "javascript", "java", "c++", "c#", "typescript", "go", "rust", "php", "ruby",
    "kotlin", "swift", "objective-c", "scala", "r", "matlab", "perl", "lua", "bash", "sql",
    
    # Фреймворки и библиотеки
    "react", "vue", "angular", "django", "flask", "fastapi", "spring", "laravel", "rails",
    "express", "node.js", "node", "asp.net", "tensorflow", "pytorch", "keras",
    
    # БД и хранилища
    "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch", "cassandra",
    "dynamodb", "firestore", "sqlite", "oracle", "mssql", "mariadb",
    
    # DevOps и инструменты
    "docker", "kubernetes", "aws", "gcp", "azure", "git", "gitlab", "github", "jenkins",
    "terraform", "ansible", "ci/cd", "devops", "linux", "nginx", "apache",
    
    # Другие технологии
    "html", "css", "api", "rest", "graphql", "grpc", "websocket", "json", "xml", "yaml",
    "microservices", "nosql", "database", "orm",
    "testing", "unittest", "pytest", "mocha", "jest", "selenium",
}

# --- КОНТЕКСТНЫЕ СЛОВА (поддерживают основной критерий) ---
CONTEXT_KEYWORDS = {
    "разработчик", "программист", "девелопер", "developer", "engineer", "architect",
    "fullstack", "full-stack", "frontend", "backend", "qa", "tester",
    "senior", "middle", "junior", "lead", "tech lead", "опыт", "навык", "skills", "experience",
    "проект", "компания", "team", "команда", "специалист", "expert", "мастер",
}

def is_valid_input(text: str) -> tuple[bool, str]:
    """
    Анализирует текст и проверяет, содержит ли он достаточно информации для анализа.
    
    ТРЕБОВАНИЯ:
    1. Не просто одно слово (например, только "Python")
    2. Минимум одна IT-технология (TECH_KEYWORDS)
    3. Минимум один контекстный элемент (опыт, уровень, другие навыки, проекты и т.д.)
       ИЛИ минимум 2-3 разные технологии
    4. Текст должен содержать информацию для реального анализа
    
    Возвращает (is_valid, message)
    """
    text_lower = text.lower().strip()
    
    if len(text_lower) < 2:
        return False, "Текст слишком короткий. Пожалуйста, укажите IT-навыки или технологии."
    
    words = text_lower.split()
    if len(words) == 1:
        return False, (
            "Пожалуйста, укажите больше информации. Одного слова недостаточно. "
            "Примеры: 'Python 3 года', 'React + Node.js', 'Java senior', 'SQL и PostgreSQL опыт 2 года' и т.д."
        )
    
    found_tech_keywords = sum(1 for keyword in TECH_KEYWORDS if keyword in text_lower)
    
    if found_tech_keywords == 0:
        return False, (
            "Пожалуйста, укажите конкретную IT-технологию. "
            "Примеры: Python, JavaScript, React, SQL, Docker, AWS, Git, PHP и т.д."
        )
    
    has_experience_context = any(keyword in text_lower for keyword in CONTEXT_KEYWORDS)
    has_year_context = any(keyword in text_lower for keyword in ["год", "года", "лет", "месяц", "месяца", "месяцев"])
    has_level = any(keyword in text_lower for keyword in ["junior", "middle", "senior", "lead", "beginner"])
    
    if found_tech_keywords == 1:
        if not (has_experience_context or has_year_context or has_level):
            return False, (
                "Пожалуйста, добавьте информацию об опыте или уровне. "
                "Примеры: 'Python 2 года', 'React middle', 'Java junior разработчик', 'SQL опыт работы' и т.д."
            )
    
    if found_tech_keywords >= 2:
        return True, ""
    
    if found_tech_keywords == 1 and (has_experience_context or has_year_context or has_level):
        return True, ""
    
    return False, (
        "Пожалуйста, укажите больше информации о ваших навыках и опыте. "
        "Примеры: 'Python 3 года разработки', 'React и Node.js junior', 'SQL, PostgreSQL, опыт работы 2 года' и т.д."
    )

def search_hh_vacancies(query: str, region: str = "1", schedule: str = "", employment: str = "", experience: str = "", part_time: str = "", per_page: int = 10, pages: int = 1) -> List[Dict[str, Any]]:
    """
    Поиск вакансий на HeadHunter с реальными зарплатами.
    """
    if not region.isdigit():
        region = "113"
        
    vacancies_with_salary = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }

    try:
        for page in range(pages):
            params = {
                "text": query,
                "area": region,
                "per_page": per_page,
                "page": page,
                "only_with_salary": True
            }
            if schedule: params["schedule"] = schedule
            if employment: params["employment"] = employment
            if experience: params["experience"] = experience
            if part_time: params["part_time"] = part_time 

            response = requests.get(HH_API_URL, params=params, headers=headers, timeout=60)
            if response.status_code != 200:
                break

            data = response.json()
            items = data.get("items", [])
            for vacancy in items:
                if vacancy.get("salary"):
                    vacancies_with_salary.append(vacancy)
                    if len(vacancies_with_salary) >= 5:
                        return vacancies_with_salary
            
            time.sleep(0.5)
        
        return vacancies_with_salary
    except Exception as e:
        logger.error(f"Ошибка при обращении к HH API: {e}")
        return []

def generate_mock_vacancies(query: str, count: int = 5, region: str = "1") -> List[Dict[str, Any]]:
    """
    Генерирует mock-вакансии только как fallback, если реальный API недоступен.
    """
    import random
    salary_ranges = {
        "python": (120000, 180000),
        "java": (130000, 190000),
        "javascript": (120000, 180000),
        "senior": (160000, 250000),
        "junior": (60000, 90000),
        "middle": (100000, 160000),
        "frontend": (110000, 170000),
        "backend": (130000, 200000),
        "devops": (140000, 210000),
        "qa": (90000, 140000),
        "data": (120000, 200000),
    }
    query_lower = query.lower()
    base_range = (100000, 150000)
    for key, value in salary_ranges.items():
        if key in query_lower:
            base_range = value
            break
    
    vacancies = []
    for i in range(count):
        salary_from = random.randint(base_range[0], int(base_range[1] * 0.7))
        salary_to = salary_from + random.randint(30000, 80000)
        vacancies.append({
            "id": f"mock_{i}",
            "name": f"Вакансия по {query} #{i+1}",
            "salary": {"from": salary_from, "to": salary_to, "currency": "RUR"},
            "employer": {"name": f"Компания #{i+1}"}
        })
    return vacancies

def extract_salary(vacancy: Dict[str, Any]) -> Dict[str, Optional[int]]:
    salary = vacancy.get("salary")
    if not salary:
        return {"from": None, "to": None, "currency": None}
    return {
        "from": salary.get("from"),
        "to": salary.get("to"),
        "currency": salary.get("currency"),
    }

def calculate_salary_statistics(salary_values: List[Dict[str, Optional[int]]]) -> Dict[str, Optional[float]]:
    flat_values = []
    for item in salary_values:
        if item["from"]: flat_values.append(item["from"])
        if item["to"]: flat_values.append(item["to"])
    if not flat_values:
        return {"average": None, "min": None, "max": None}
    return {
        "average": sum(flat_values) / len(flat_values),
        "min": min(flat_values),
        "max": max(flat_values),
    }


def clean_llm_list_output(raw_text: str, max_items: int = 10) -> List[str]:
    """
    Очищает ответ LLM, оставляя только пункты нумерованного/маркированного списка.
    Убирает преамбулу, разговорный мусор, пустые строки.
    """
    import re
    lines = raw_text.strip().splitlines()
    result = []
    # Паттерн для строки-пункта списка: начинается с цифры, маркера или **
    list_item_re = re.compile(r'^\s*(?:\d+[.)\-]|[-•*]|\*\*)\s+')

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Пропускаем строки, похожие на разговорную преамбулу
        if not list_item_re.match(stripped):
            # Если строка не является пунктом списка, пропускаем
            # (это преамбула вроде "Привет! Как ментор, я вижу...")
            continue
        # Убираем нумерацию/маркеры, оставляем только текст
        clean = re.sub(r'^\s*(?:\d+[.)\-]|[-•*])\s+', '', stripped).strip()
        if clean and len(clean) > 3:
            result.append(clean)
        if len(result) >= max_items:
            break

    # Фолбэк: если ничего не нашли через list_item_re,
    # берём все непустые строки кроме первых 1-2 (скорее всего преамбула)
    if not result:
        non_empty = [l.strip() for l in lines if l.strip()]
        # Пропускаем строки без конкретного содержания (преамбула)
        for line in non_empty:
            clean = re.sub(r'^\s*(?:\d+[.)\-]|[-•*])\s*', '', line).strip()
            if len(clean) > 10 and not any(w in clean.lower() for w in [
                'привет', 'как ментор', 'давай начн', 'расскажи',
                'пришли', 'жду тво', 'чтобы я мог', 'мне нужно понять'
            ]):
                result.append(clean)
            if len(result) >= max_items:
                break

    return result


def generate_mock_llm_response(prompt: str) -> str:
    return "Анализ выполнен. [ИНТЕРВЬЮ ЗАВЕРШЕНО]"

def call_openrouter(prompt: str, chat_history: List[ChatMessage] | None = None, stream: bool = False, system_prompt: str | None = SYSTEM_PROMPT, model: str | None = None):
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        logger.error("OPENROUTER_API_KEY is not set in environment!")
        raise HTTPException(status_code=500, detail="Отсутствует ключ OPENROUTER_API_KEY")

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    if chat_history:
        for msg in chat_history:
            messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": prompt})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model or DEFAULT_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 1500,
        "stream": stream,
    }

    try:
        logger.info(f"Sending request to OpenRouter API (model: {payload['model']})")
        if stream:
            response = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, stream=True, timeout=60)
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail=f"OpenRouter error: {response.text}")
            
            def stream_generator():
                for chunk in response.iter_lines():
                    if chunk:
                        chunk_str = chunk.decode('utf-8')
                        if chunk_str.startswith('data: ') and chunk_str != 'data: [DONE]':
                            try:
                                data = json.loads(chunk_str[6:])
                                if 'choices' in data and len(data['choices']) > 0:
                                    delta = data['choices'][0].get('delta', {})
                                    if 'content' in delta:
                                        yield delta['content']
                            except:
                                pass
            return stream_generator()
        else:
            response = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=60)
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail=f"OpenRouter error: {response.text}")
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="OpenRouter API timeout")

def call_openai(prompt: str, chat_history: List[ChatMessage] | None = None, stream: bool = False, system_prompt: str | None = SYSTEM_PROMPT, model: str | None = None):
    return call_openrouter(prompt, chat_history, stream, system_prompt=system_prompt, model=model)

def call_llm(prompt: str, chat_history: List[ChatMessage] | None = None, stream: bool = False, system_prompt: str | None = SYSTEM_PROMPT, model: str | None = None):
    try:
        if LLM_PROVIDER == "openrouter":
            return call_openrouter(prompt, chat_history, stream=stream, system_prompt=system_prompt, model=model)
        else:
            return call_openai(prompt, chat_history, stream=stream, system_prompt=system_prompt, model=model)
    except Exception as e:
        logger.error(f"LLM call failed: {str(e)}", exc_info=True)
        if stream:
            def mock_stream(): yield generate_mock_llm_response(prompt)
            return mock_stream()
        return generate_mock_llm_response(prompt)

def build_skill_extraction_prompt(text: str) -> str:
    return (
        "Проанализируй текст ниже и выдели только ключевые навыки, технологии, инструменты, языки программирования. "
        "Выведи ответ в виде нумерованного списка на русском языке, каждое значение — на новой строке. "
        "Не добавляй пояснений."
        f"Текст резюме / навыки: {text}"
    )

def build_filters_extraction_prompt(text: str) -> str:
    return (
        "Проанализируй диалог и извлеки предпочтения кандидата по работе. Верни СТРОГО валидный JSON формат, без пояснений, без markdown разметки. Ключи JSON:\n"
        '- "region": строка (например "1" для Москвы, "2" Питер, "113" вся Россия). Если не указано, верни "113".\n'
        '- "schedule": "fullDay", "shift", "flexible", "remote", "flyInFlyOut" или "".\n'
        '- "employment": "full", "part", "project", "probation" или "".\n'
        '- "experience": "noExperience", "between1And3", "between3And6", "moreThan6" или "".\n'
        '- "part_time": "from_four_to_six_hours_in_a_day", "part_time_evening", "only_saturday_and_sunday" или "".\n\n'
        f"Текст диалога:\n{text}\n\nТолько JSON:"
    )

def build_development_plan_prompt(skills: List[str], region: str, filters: dict):
    return (
        "ЗАДАЧА: Составь план развития для IT-специалиста.\n"
        f"Навыки кандидата: {', '.join(skills)}.\n\n"
        "ФОРМАТ ОТВЕТА: Только нумерованный список из 4-6 пунктов. "
        "Каждый пункт — конкретный шаг: какой навык подтянуть, что изучить, какой курс пройти.\n"
        "НЕ пиши приветствий, преамбул, вводных слов и вопросов. "
        "НЕ задавай вопросов. НЕ начинай с 'Привет'. "
        "Сразу начинай с '1.' — первого пункта.\n\n"
        "Пример формата:\n"
        "1. Изучить Kubernetes: Helm-чарты, настройка кластеров, мониторинг.\n"
        "2. Освоить AWS: EC2, S3, Lambda.\n"
    )


def build_additional_skills_prompt(skills: List[str], dialogue_text: str):
    return (
        "ЗАДАЧА: На основе навыков кандидата определи, какие дополнительные технологии и навыки "
        "чаще всего требуют работодатели для специалистов с таким стеком.\n"
        f"Навыки кандидата: {', '.join(skills)}.\n\n"
        "ФОРМАТ ОТВЕТА: Только нумерованный список из 4-6 технологий/навыков, которых НЕТ в списке кандидата, "
        "но которые часто встречаются в вакансиях рядом с его стеком.\n"
        "Каждый пункт — название технологии или навыка (коротко, 2-5 слов).\n"
        "НЕ пиши приветствий, преамбул и пояснений. Сразу начинай с '1.'.\n\n"
        "Пример формата:\n"
        "1. Kubernetes\n"
        "2. Apache Airflow\n"
        "3. Terraform\n"
    )

def build_profile_title_prompt(text: str) -> str:
    return (
        "Определи наиболее подходящую должность (название вакансии) и грейд (Junior, Middle, Senior, Lead) кандидата. "
        "Выведи только одно точное название. Не пиши никаких лишних слов.\n\n"
        f"Текст:\n{text}"
    )

@app.post("/api/chat")
def chat(request: ChatRequest):
    return StreamingResponse(call_llm(request.text, request.chat_history, stream=True, model=request.model), media_type="text/plain")

@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    logger.info(f"--- [NEW ANALYZE REQUEST] ---")
    try:
        query = request.text.strip()
        full_dialogue_text = "\n".join([f"{msg.role}: {msg.content}" for msg in request.chat_history]) + f"\nuser: {query}"
        
        is_valid, error_msg = is_valid_input(full_dialogue_text)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        logger.info("Extracting skills from dialogue...")
        raw_skills = call_llm(build_skill_extraction_prompt(full_dialogue_text), system_prompt=None, model=request.model)
        skills = [line.strip(" ").lstrip("0123456789.- ") for line in raw_skills.splitlines() if line.strip()][:10]

        logger.info("Extracting filters from dialogue...")
        raw_filters = call_llm(build_filters_extraction_prompt(full_dialogue_text), system_prompt=None, model=request.model)
        filters = {}
        try:
            import json
            raw_filters = raw_filters.strip("` \n")
            if raw_filters.startswith("json"):
                raw_filters = raw_filters[4:]
            filters = json.loads(raw_filters)
        except Exception as e:
            logger.error(f"Failed to parse filters JSON: {raw_filters}, Error: {e}")
            filters = {"region": "113", "schedule": "", "employment": "", "experience": "", "part_time": ""}

        hh_search_query = " ".join(skills[:3]) if skills else query
        
        logger.info("Searching HeadHunter API...")
        vacancies = search_hh_vacancies(
            query=hh_search_query, 
            region=filters.get("region", "113"),
            schedule=filters.get("schedule", ""),
            employment=filters.get("employment", ""),
            experience=filters.get("experience", ""),
            part_time=filters.get("part_time", ""),
            per_page=10, 
            pages=1
        )
        
        if not vacancies:
            vacancies = generate_mock_vacancies(hh_search_query, count=5, region=filters.get("region", "113"))
        
        salary_dicts = [extract_salary(vacancy) for vacancy in vacancies]
        stats = calculate_salary_statistics(salary_dicts)
        
        salary_values = [
            SalaryData(
                salary_from=float(s["from"]) if s["from"] else None, 
                salary_to=float(s["to"]) if s["to"] else None, 
                currency=s["currency"],
                vacancy_title=vacancy.get("name"),
                vacancy_url=vacancy.get("alternate_url"),
                employer_name=vacancy.get("employer", {}).get("name")
            ) 
            for s, vacancy in zip(salary_dicts, vacancies)
        ]

        logger.info("Generating development plan...")
        raw_plan = call_llm(build_development_plan_prompt(skills, filters.get("region", "113"), filters), system_prompt=None, model=request.model)
        development_plan = clean_llm_list_output(raw_plan, max_items=6)
        # Фолбэк если clean вернул пустоту
        if not development_plan:
            development_plan = [line.strip() for line in raw_plan.splitlines() if line.strip()][:6]

        logger.info("Generating additional skills...")
        raw_additional = call_llm(build_additional_skills_prompt(skills, full_dialogue_text), system_prompt=None, model=request.model)
        additional_skills = clean_llm_list_output(raw_additional, max_items=6)
        if not additional_skills:
            additional_skills = [line.strip() for line in raw_additional.splitlines() if line.strip()][:6]

        profile_title_raw = call_llm(build_profile_title_prompt(full_dialogue_text), system_prompt=None, model=request.model).strip(" \n.\"'*")
        
        return AnalyzeResponse(
            average_salary=stats["average"],
            min_salary=stats["min"],
            max_salary=stats["max"],
            vacancies_found=len(vacancies),
            salary_values=salary_values,
            skills=skills,
            additional_skills=additional_skills,
            development_plan=development_plan,
            profile_title=profile_title_raw,
            message="Анализ выполнен успешно."
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in analyze: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка: {str(e)}")

app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
