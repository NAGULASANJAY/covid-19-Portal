const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

const convertDBStateObj = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDBDistrictObj = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectedUserQuery = `SELECT * FROM user
    WHERE username = '${username}'
    `;

  const dbUser = await db.get(selectedUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "findpwd");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", async (request, response) => {
  const authHeader = request.headers["authorization"];

  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "findpwd", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        const getStateQuery = `
                SELECT * FROM state;
                `;

        const stateArray = await db.all(getStateQuery);
        response.send(stateArray);
      }
    });
  }
});

function middleWare(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "findpwd", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

app.get("/states/", middleWare, async (request, response) => {
  const getState = `SELECT * FROM state;
    `;
  const allState = await db.all(getState);
  response.send(allState.map((eachState) => convertDBStateObj(eachState)));
});

app.get("/states/:stateId/", middleWare, async (request, response) => {
  const { stateId } = request.params;

  const getStateId = `
    SELECT * FROM state
    WHERE state_id = '${stateId}';
    `;

  const stateQuery = await db.get(getStateId);
  response.send(convertDBStateObj(stateQuery));
});

app.post("/districts/", middleWare, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;

  const insertDetails = `INSERT INTO district (
        district_name,
        state_id,
        cases,
        cured,
        active,
        deaths)
        VALUES(
            '${districtName}',
            ${stateId},
            ${cases},
            ${cured},
            ${active},
            ${deaths}
        );
    `;

  await db.run(insertDetails);

  response.send("District Successfully Added");
});

app.get("/districts/:districtId/", middleWare, async (request, response) => {
  const { districtId } = request.params;

  const selectDistQuery = `
    SELECT * FROM district
    WHERE district_id = '${districtId}';
    `;

  const showDistrict = await db.get(selectDistQuery);

  response.send(convertDBDistrictObj(showDistrict));
});

app.delete("/districts/:districtId/", middleWare, async (request, response) => {
  const { districtId } = request.params;

  const removeDistId = `
    DELETE FROM district
    WHERE district_id = '${districtId}';
    `;

  await db.run(removeDistId);

  response.send("District Removed");
});

app.put("/districts/:districtId/", middleWare, async (request, response) => {
  const { districtId } = request.params;

  const { districtName, stateId, cases, cured, active, deaths } = request.body;

  const updateDistDetail = `
    UPDATE district
    SET 
    district_name = '${districtName}',
    state_id = '${stateId}',
    cases = '${cases}',
    cured = '${cured}',
    active = '${active}',
    deaths = '${deaths}'
    WHERE district_id = ${districtId};
    `;

  await db.run(updateDistDetail);

  response.send("District Details Updated");
});

app.get("/states/:stateId/stats/", middleWare, async (request, response) => {
  const { stateId } = request.params;

  const totalStats = `
    SELECT SUM(cases), SUM(cured), SUM(active), SUM(deaths)
    FROM district
    WHERE state_id = '${stateId}';
    `;

  const statsDetail = await db.get(totalStats);
  response.send({
    totalCases: statsDetail["SUM(cases)"],
    totalCured: statsDetail["SUM(cured)"],
    totalActive: statsDetail["SUM(active)"],
    totalDeaths: statsDetail["SUM(deaths)"],
  });
});

module.exports = app;
