FROM python:3.12-slim

WORKDIR /app

# Install Montserrat (brand font) for ReportLab + DOCX/XLSX consistency.
# Debian's fonts-montserrat package drops the TTFs into /usr/share/fonts/truetype/montserrat/.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-montserrat \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

EXPOSE 8100

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
