import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

function clean(value = "") {
  return String(value)
    .replace(/[\\"]/g, "")
    .replace(/\n/g, " ")
    .trim();
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function geocodeCity(city) {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: city,
      format: "json",
      limit: "1",
      countrycodes: "br"
    });

  const response = await fetch(url, {
    headers: {
      "User-Agent": "LeadHunter/1.0"
    }
  });

  if (!response.ok) {
    throw new Error("Não foi possível localizar a cidade.");
  }

  const data = await response.json();

  if (!data.length) {
    throw new Error(`Cidade não encontrada: ${city}`);
  }

  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon)
  };
}

function getSearchTags(category) {
  const c = category.toLowerCase();

  if (
    c.includes("barbear") ||
    c.includes("barber")
  ) {
    return `
      nwr["shop"="hairdresser"]
        (around:RADIUS,LAT,LON);
    `;
  }

  if (
    c.includes("dent") ||
    c.includes("odont")
  ) {
    return `
      nwr["amenity"="dentist"]
        (around:RADIUS,LAT,LON);
    `;
  }

  if (
    c.includes("restaurante") ||
    c.includes("restaurant")
  ) {
    return `
      nwr["amenity"="restaurant"]
        (around:RADIUS,LAT,LON);
    `;
  }

  if (
    c.includes("advoc") ||
    c.includes("advogado")
  ) {
    return `
      nwr["office"="lawyer"]
        (around:RADIUS,LAT,LON);
    `;
  }

  if (
    c.includes("cabeleire") ||
    c.includes("salão") ||
    c.includes("salao")
  ) {
    return `
      nwr["shop"="hairdresser"]
        (around:RADIUS,LAT,LON);
    `;
  }

  if (
    c.includes("academia") ||
    c.includes("gym")
  ) {
    return `
      nwr["leisure"="fitness_centre"]
        (around:RADIUS,LAT,LON);
    `;
  }

  if (
    c.includes("hotel")
  ) {
    return `
      nwr["tourism"="hotel"]
        (around:RADIUS,LAT,LON);
    `;
  }

  if (
    c.includes("mercado") ||
    c.includes("supermercado")
  ) {
    return `
      nwr["shop"="supermarket"]
        (around:RADIUS,LAT,LON);
    `;
  }

  if (
    c.includes("farmácia") ||
    c.includes("farmacia")
  ) {
    return `
      nwr["amenity"="pharmacy"]
        (around:RADIUS,LAT,LON);
    `;
  }

  const regex =
    escapeRegex(category);

  return `
    nwr["name"~"${regex}",i"]
      (around:RADIUS,LAT,LON);
  `;
}

app.get("/api/leads", async (req, res) => {

  try {

    const category =
      clean(
        req.query.category ||
        "barbearia"
      );

    const city =
      clean(
        req.query.city ||
        "Juiz de Fora, MG"
      );

    const radius =
      Math.max(
        1000,
        Math.min(
          Number(req.query.radius) ||
          10000,
          30000
        )
      );

    const onlyNoSite =
      req.query.onlyNoSite === "true";

    console.log("");
    console.log(
      "🔎 Nova busca:",
      category,
      "|",
      city,
      "|",
      radius,
      "metros"
    );

    const center =
      await geocodeCity(city);

    const template =
      getSearchTags(category);

    const query =
      template
        .replaceAll(
          "RADIUS",
          radius
        )
        .replaceAll(
          "LAT",
          center.lat
        )
        .replaceAll(
          "LON",
          center.lon
        );

    const overpassQuery = `
[out:json][timeout:20];

${query}

out center tags;
`;

    console.log(
      "🌎 Consultando OpenStreetMap..."
    );

    const response =
      await fetch(
        "https://overpass-api.de/api/interpreter",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "text/plain;charset=UTF-8",
            "User-Agent":
              "LeadHunter/1.0"
          },
          body:
            overpassQuery
        }
      );

    const text =
      await response.text();

    if (!response.ok) {

      console.error(
        "Overpass:",
        response.status
      );

      throw new Error(
        `O serviço de mapas demorou demais para responder (${response.status}).`
      );
    }

    let data;

    try {

      data =
        JSON.parse(text);

    } catch {

      throw new Error(
        "O serviço de mapas retornou uma resposta inválida."
      );
    }

    const seen =
      new Set();

    let leads =
      [];

    for (
      const element of
      data.elements || []
    ) {

      const tags =
        element.tags || {};

      const name =
        tags.name;

      if (!name) {
        continue;
      }

      const lat =
        element.lat ??
        element.center?.lat ??
        null;

      const lon =
        element.lon ??
        element.center?.lon ??
        null;

      const key =
        `${name.toLowerCase()}|${lat}|${lon}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const website =
        tags.website ||
        tags["contact:website"] ||
        tags.url ||
        "";

      const phone =
        tags.phone ||
        tags["contact:phone"] ||
        "";

      const email =
        tags.email ||
        tags["contact:email"] ||
        "";

      const instagram =
        tags.instagram ||
        tags["contact:instagram"] ||
        "";

      const street =
        tags["addr:street"] ||
        "";

      const number =
        tags["addr:housenumber"] ||
        "";

      const neighborhood =
        tags["addr:suburb"] ||
        "";

      const cityName =
        tags["addr:city"] ||
        city;

      const address = [
        street,
        number,
        neighborhood,
        cityName
      ]
        .filter(Boolean)
        .join(", ");

      let maps = "";

      if (
        lat !== null &&
        lon !== null
      ) {
        maps =
          `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      }

      leads.push({

        id:
          element.id,

        name,

        category,

        address:
          address ||
          "Endereço não informado",

        phone,

        email,

        website,

        instagram,

        latitude:
          lat,

        longitude:
          lon,

        maps,

        hasWebsite:
          Boolean(website),

        source:
          "OpenStreetMap"

      });
    }

    if (onlyNoSite) {

      leads =
        leads.filter(
          lead =>
            !lead.hasWebsite
        );

    }

    leads.sort(
      (a, b) => {

        if (
          a.hasWebsite !==
          b.hasWebsite
        ) {

          return (
            Number(a.hasWebsite) -
            Number(b.hasWebsite)
          );

        }

        return a.name.localeCompare(
          b.name,
          "pt-BR"
        );
      }
    );

    console.log(
      `✅ ${leads.length} empresas encontradas`
    );

    res.json({

      success: true,

      total:
        leads.length,

      city,

      category,

      radius,

      source:
        "OpenStreetMap / Overpass API",

      notice:
        "Resultados baseados em dados públicos do OpenStreetMap. A cobertura pode variar conforme a cidade.",

      leads

    });

  } catch (error) {

    console.error(
      "❌ LeadHunter:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        error.message ||
        "Erro desconhecido."

    });

  }

});

app.listen(
  PORT,
  () => {

    console.log("");
    console.log(
      "===================================="
    );
    console.log(
      "       LEADHUNTER REAL"
    );
    console.log(
      "===================================="
    );
    console.log(
      `Servidor: http://localhost:${PORT}`
    );
    console.log(
      "Servidor iniciado."
    );
    console.log("");

  }
);