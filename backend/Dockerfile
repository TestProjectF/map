FROM hsynaltklc/draw2cost-odafileconverter:latest as oda

FROM python:3.12-slim

COPY --from=oda /usr/bin/ODAFileConverter_25.8.0.0 /usr/bin/ODAFileConverter_25.8.0.0
COPY --from=oda /usr/bin/ODAFileConverter /usr/bin/ODAFileConverter

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       gdal-bin libgdal-dev build-essential \
       libgl1 libx11-6 libxkbcommon0 libfontconfig1 libxext6 libxrender1 \
       libxkbcommon-x11-0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-render-util0 libxcb-shape0 libxcb-xkb1 \
       xvfb xauth \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir "GDAL==$(gdal-config --version)"

COPY app ./app
COPY data ./data

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
