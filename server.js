```js
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

/*
  Cidades conhecidas.
  Isso evita depender do Nominatim para pesquisas
  repetidas dessas cidades.
*/
const CITY_COORDINATES = {
  "juiz de fora": {
    lat: -21.7642,
    lon: -43.3503
  },

  "juiz de fora mg": {
    lat: -21.7642,
    lon: -43.3503
  },

  "juiz de fora, mg": {
    lat: -21.7642,
    lon: -43.3503
  },

  "belo horizonte": {
    lat: -19.9167,
    lon: -43.9345
  },

  "belo horizonte mg": {
    lat: -19.9167,
    lon: -43.9345
  },

  "são paulo": {
    lat: -23.5505,
    lon: -46.6333
  },

  "sao paulo": {
    lat: -23.5505,
    lon: -46.6333
  },

  "rio de janeiro": {
    lat: -22.9068,
    lon: -43.1729
  },

  "curitiba": {
    lat: -25.4284,
    lon: -49.2733
  },

  "brasília": {
    lat: -15.7939,
    lon: -47.8828
  },

  "brasilia": {
    lat: -15.7939,
    lon: -47.8828
  },

  "porto alegre": {
    lat: -30.0346,
    lon: -51.2177
  },

  "recife": {
    lat: -8.0476,
    lon: -34.8770
  },

  "salvador": {
    lat: -12.9777,
    lon: -38.5016
  }
};

async function geocodeCity(city) {

  const normalized =
    clean(city)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const exactKey =
    normalized;

  if (CITY_COORDINATES[exactKey]) {
    console.log(
      "📍 Cidade encontrada no banco local:",
      city
    );

    return CITY_COORDINATES[exactKey];
  }

  /*
    Tenta encontrar apenas o nome principal
    antes da vírgula.
  */
  const cityName =
    normalized
      .split(",")[0]
      .trim();

  if (CITY_COORDINATES[cityName]) {
    console.log(
      "📍 Cidade encontrada no banco local:",
      cityName
    );

    return CITY_COORDINATES[cityName];
  }

  /*
    Fallback para Nominatim.
  */
  console.log(
    "🌎 Consultando geocodificação externa:",
    city
  );

  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: `${city}, Brasil`,
      format: "json",
      limit: "1",
      countrycodes: "br"
    });

  const response =
    await fetch(url, {
      headers: {
        "User-Agent":
          "LeadHunter/1.0"
      }
    });

  if (!response.ok) {
    throw new Error(
      "Não foi possível localizar essa cidade."
    );
  }

  const data =
    await response.json();

  if (!data.length) {
    throw new Error(
      `Cidade não encontrada: ${city}`
    );
  }

  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon)
  };
}

function getSearchQuery(
  category,
  radius,
  lat,
  lon
) {

  const c =
    category
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const area =
    `(around:${radius},${lat},${lon})`;

  /*
    Categorias específicas.
  */

  if (
    c.includes("barbear") ||
    c.includes("barber")
  ) {
    return `
      nwr["shop"="hairdresser"]${area};
    `;
  }

  if (
    c.includes("dent") ||
    c.includes("odont")
  ) {
    return `
      nwr["amenity"="dentist"]${area};
    `;
  }

  if (
    c.includes("restaurante") ||
    c.includes("restaurant")
  ) {
    return `
      nwr["amenity"="restaurant"]${area};
    `;
  }

  if (
    c.includes("advog") ||
    c.includes("advocacia")
  ) {
    return `
      nwr["office"="lawyer"]${area};
    `;
  }

  if (
    c.includes("cabeleire") ||
    c.includes("salao") ||
    c.includes("salão")
  ) {
    return `
      nwr["shop"="hairdresser"]${area};
    `;
  }

  if (
    c.includes("academia") ||
    c.includes("gym")
  ) {
    return `
      nwr["leisure"="fitness_centre"]${area};
    `;
  }

  if (
    c.includes("hotel")
  ) {
    return `
      nwr["tourism"="hotel"]${area};
    `;
  }

  if (
    c.includes("mercado") ||
    c.includes("supermercado")
  ) {
    return `
      nwr["shop"="supermarket"]${area};
    `;
  }

  if (
    c.includes("farmacia") ||
    c.includes("farmácia")
  ) {
    return `
      nwr["amenity"="pharmacy"]${area};
    `;
  }

  /*
    Para termos personalizados,
    procura pelo nome.
  */

  const regex =
    escapeRegex(category);

  return `
    nwr["name"~"${regex}",i"]${area};
  `;
}

app.get(
  "/api/leads",
  async (req, res) => {

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
        "===================================="
      );
      console.log(
        "🔎 NOVA BUSCA"
      );
      console.log(
        "Ramo:",
        category
      );
      console.log(
        "Cidade:",
        city
      );
      console.log(
        "Raio:",
        radius,
        "metros"
      );
      console.log(
        "Somente sem site:",
        onlyNoSite
      );
      console.log(
        "===================================="
      );

      const center =
        await geocodeCity(city);

      console.log(
        "📍 Coordenadas:",
        center.lat,
        center.lon
      );

      const searchQuery =
        getSearchQuery(
          category,
          radius,
          center.lat,
          center.lon
        );

      const overpassQuery = `
[out:json][timeout:20];

(
${searchQuery}
);

out center tags;
`;

      console.log(
        "🌎 Consultando empresas..."
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

      const responseText =
        await response.text();

      if (!response.ok) {

        console.error(
          "Overpass:",
          response.status
        );

        throw new Error(
          `O serviço de empresas retornou erro ${response.status}.`
        );
      }

      let data;

      try {

        data =
          JSON.parse(
            responseText
          );

      } catch {

        throw new Error(
          "O serviço de empresas retornou uma resposta inválida."
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

        const uniqueKey =
          `${name.toLowerCase()}|${lat}|${lon}`;

        if (
          seen.has(uniqueKey)
        ) {
          continue;
        }

        seen.add(uniqueKey);

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

        const facebook =
          tags.facebook ||
          tags["contact:facebook"] ||
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

        const address =
          [
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

          facebook,

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

        success:
          true,

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

      console.error("");
      console.error(
        "❌ ERRO NO LEADHUNTER:"
      );
      console.error(
        error.stack ||
        error
      );

      res.status(500).json({

        success:
          false,

        error:
          error.message ||
          "Erro desconhecido."

      });

    }

  }
);

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
```
