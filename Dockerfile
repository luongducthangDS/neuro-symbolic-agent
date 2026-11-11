FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY nsa nsa
COPY data/seed.py data/seed.py
COPY data/policies data/policies
RUN python data/seed.py
EXPOSE 8000
CMD ["uvicorn", "nsa.api:app", "--host", "0.0.0.0", "--port", "8000"]
