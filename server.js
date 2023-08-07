const express = require("express");
const axios = require("axios").create({
  httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }),
});
const crypto = require("crypto");
const cors = require("cors");
const WebSocket = require("ws");
const app = express();
const port = 3000;
let activeSocket = null;
const server = new WebSocket.Server({ port: 3001 });
app.use(cors());
app.use(express.json());
const secretToken = "-_W0O4vPShCbIXoO8WXQJQ";

app.get("/exchangeCode", async (req, res) => {
  const authorizationCode = req.query.code;
  const redirecturl = req.query.redirecturl;
  const clientId = req.query.clientId;
  const clientSecret = req.query.clientSecret;
  try {
    const response = await axios.post("https://zoom.us/oauth/token", null, {
      params: {
        grant_type: "authorization_code",
        code: authorizationCode,
        redirect_uri: redirecturl,
      },
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${clientId}:${clientSecret}`
        ).toString("base64")}`,
      },
    });
    const refreshToken = response.data.refresh_token;
    const accessToken = response.data.access_token;
    res.send({ refresh_token: refreshToken, access_token: accessToken });
  } catch (error) {
    console.error("Ошибка при получении токенов", error.response.data || error);
    res.status(500).send(error.response.data || error);
  }
});

app.post("/refreshToken", async (req, res) => {
  const refreshToken = req.body.refreshToken;
  const clientId = req.body.clientId;
  const clientSecret = req.body.clientSecret;
  try {
    const response = await axios.post("https://zoom.us/oauth/token", null, {
      params: {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      },
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${clientId}:${clientSecret}`
        ).toString("base64")}`,
      },
    });
    const newAccessToken = response.data.access_token;
    const newRefreshToken = response.data.refresh_token;
    res.send({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    console.error(
      "Ошибка при получении refreshToken",
      error.response.data || error
    );
    res.status(500).send(error.response.data || error);
  }
});

app.get("/listMeetings", async (req, res) => {
  const accessToken = req.query.accessToken;
  try {
    let allMeetings = [];
    let nextPageToken = "";
    do {
      const response = await axios.get(
        `https://api.zoom.us/v2/users/me/meetings?page_size=300&next_page_token=${nextPageToken}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      const meetings = response.data;
      allMeetings = [...allMeetings, ...meetings.meetings];
      nextPageToken = meetings.next_page_token;
    } while (nextPageToken);
    res.send({ meetings: allMeetings });
  } catch (error) {
    console.error(
      "Ошибка при получении listMeetings:",
      error.response.data || error
    );
    res.status(500).send(error.response.data || error);
  }
});

app.get("/newConference", async (req, res) => {
  const accessToken = req.query.token;
  const conferenceTopic = req.query.conferenceTopic;
  const timeStart = req.query.timeStart;
  const conferenceDuration = req.query.conferenceDuration;
  try {
    const meetingResponse = await axios.post(
      "https://api.zoom.us/v2/users/me/meetings",
      {
        topic: conferenceTopic,
        type: 2,
        start_time: timeStart,
        duration: conferenceDuration,
        settings: {
          host_video: true,
          participant_video: true,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.send({ meeting: meetingResponse.data });
  } catch (error) {
    console.error(
      "Ошибка при создании новой конференции",
      error.response.data || error
    );
    res.status(500).send(error.response.data || error);
  }
});

app.patch("/updateConferenceInfo", async (req, res) => {
  try {
    const { accessToken, data, id } = req.body;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    const response = await axios.patch(
      `https://api.zoom.us/v2/meetings/${id}`,
      data,
      { headers: headers }
    );
    res.send(response.data);
  } catch (error) {
    console.error(
      "Ошибка при редактировании конференции",
      error.response.data || error
    );
    res.status(500).send(error.response.data || error);
  }
});

app.delete("/deleteConference", async (req, res) => {
  const { accessToken, id } = req.body;
  try {
    const response = await axios.delete(
      `https://api.zoom.us/v2/meetings/${id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.status(200).send(response.data);
  } catch (error) {
    console.error(
      "Ошибка при удалении конференции",
      error.response.data || error
    );
    res.status(500).send(error.response.data || error);
  }
});

server.on("connection", (ws) => {
  activeSocket = ws;
  ws.on("close", () => {
    activeSocket = null;
  });
});

app.post("/webHooks", async (request, response) => {
  try {
    if (request.body.event === "endpoint.url_validation") {
      const hashForValidate = crypto
        .createHmac("sha256", secretToken)
        .update(request.body.payload.plainToken)
        .digest("hex");
      response.status(200);
      response.json({
        plainToken: request.body.payload.plainToken,
        encryptedToken: hashForValidate,
      });
    } else if (activeSocket) {
      activeSocket.send(JSON.stringify(request.body));
    }
  } catch (err) {
    console.error(err);
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
