FROM python:3.12-slim

WORKDIR /app

# Install Montserrat (brand font) for ReportLab + DOCX/XLSX consistency.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && mkdir -p /usr/share/fonts/truetype/montserrat \
 && curl -fsSL -o /usr/share/fonts/truetype/montserrat/Montserrat-Regular.ttf \
      https://github.com/google/fonts/raw/main/ofl/montserrat/static/Montserrat-Regular.ttf \
 && curl -fsSL -o /usr/share/fonts/truetype/montserrat/Montserrat-Bold.ttf \
      https://github.com/google/fonts/raw/main/ofl/montserrat/static/Montserrat-Bold.ttf \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

EXPOSE 8100

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
