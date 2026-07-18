FROM hsynaltklc/draw2cost-odafileconverter:latest as oda
FROM python:3.12-slim
COPY --from=oda /usr/bin/ODAFileConverter_25.8.0.0 /usr/bin/ODAFileConverter_25.8.0.0
COPY --from=oda /usr/bin/ODAFileConverter /usr/bin/ODAFileConverter
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libx11-6 libxkbcommon0 libfontconfig1 libxext6 libxrender1 \
    xvfb xauth \
    && rm -rf /var/lib/apt/lists/*
CMD ["xvfb-run", "-a", "ODAFileConverter"]
