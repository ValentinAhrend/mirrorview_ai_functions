/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onCall, onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const functions = require("firebase-functions");
const { v4: uuidv4 } = require("uuid");
const { initializeApp } = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
  FieldValue,
  Filter,
} = require("firebase-admin/firestore");
const { getDatabase, ServerValue } = require("firebase-admin/database");
const { firestore, database, auth } = require("firebase-admin");

initializeApp();

/*const BASE_PROMPTS = {
    interview: "You are an interviewer at a company. All information about how to act, what job the candidate is applying for and about the company, its vision, culture itself are in the appended JSON object. Tailor your questions based on the candidate's responses and the information provided in the JSON file. Evaluate the candidate's qualifications, experience, and fit for the role based on the job requirements outlined in the JSON. Assess the candidate's alignment with the company culture as described in the JSON. Remember to ask probing questions, challenge the candidate when appropriate, and maintain a professional and engaging demeanor throughout the interview. To simulate a realistic interview experience, feel free to introduce unexpected questions or challenges based on the candidate's responses or your understanding of the role. Additionally, consider incorporating elements of small talk, company culture, and team dynamics into the conversation. Use the following JSON object: "
}*/

function summarize(topics_array) {
  var ts = "";
  for (let index = 0; index < topics_array.length; index++) {
    const topic = topics_array[index];
    ts += topic;
    if (index == topics_array.length - 2) {
      ts += " and ";
    } else {
      if (index < topics_array.length - 2) {
        ts += ", ";
      }
    }
  }
  return ts;
}

const createSystemPrompt = (configuration) => {
  if (configuration["type"] == "interview") {
    /// use interview prompt.
    var base_prompt = BASE_PROMPTS.interview;
    return base_prompt;
  }
};

const CONFIGURATIONS = {
  params: [
    {
      /// the attitude of the character
      key: "attitude",
      type: "string",
    },
    {
      /// the type of roleplay (e.g. interview, custom, evaluation, presentation, deal, connecting)
      key: "type",
      type: "string",
    },
    {
      /// the main topic of the conversation (use depends on type of roleplay)
      key: "mainTopic",
      type: "string",
    },
    {
      /// other needed topics (use depends on type of roleplay)
      key: "topics",
      type: "object",
    },
    {
      /// insights useful for the conversation (use depends on type of roleplay)
      key: "insights",
      type: "object",
    },
    {
      /// the maximum time the conversation takes
      key: "maxTime",
      type: "number",
    },
  ],
};
exports.countFeedback = onCall(async (req) => {
  const uid = req.auth.uid;
  /// this function is only available for signed in users (with an uid)
  if (uid == undefined || uid == null || !(typeof uid == "string")) {
    return {
      status: "fail",
    };
  }
  const database = getDatabase();
  await database
    .ref("realtime_data")
    .child("reviews")
    .set(ServerValue.increment(1));
  return {
    status: "success",
  };
});
exports.addTokens = onCall(async (req) => {
  const text = req.data.text; /// number of new tokens
  const uid = req.auth.uid;

  const database = getDatabase();
  let snap = await database.ref("/usage").child(uid).get();
  var n;
  if (snap.exists) {
    n = snap.val();
    if (typeof n == "string") {
      n = Number.parseInt(n);
    }
  } else {
    n = 0;
  }
  let newN = n + Number.parseInt(text);

  if (newN != n) {
    await database.ref("/usage").child(uid).set(newN);
  }

  return newN;
});

exports.startConversation = onCall(async (req) => {
  logger.info("Called Start Conversation in Cloud Functions");
  const uid = req.auth.uid;
  /// this function is only available for signed in users (with an uid)
  if (uid == undefined || uid == null || !(typeof uid == "string")) {
    throw new HttpsError("invalid-credentials", "Not allowed");
  }
  /// check given parameters
  var inputData = req.rawRequest.body;
  if (typeof inputData == "string") {
    /// not serialized
    inputData = JSON.parse(inputData);
  } else {
    if (typeof inputData != "object") {
      throw new HttpsError("invalid-body", "Not allowed");
    }
  }
  /*for (let index = 0; index < CONFIGURATIONS.params.length; index++) {
        const element = CONFIGURATIONS.params[index];
        if(Object.keys(inputData).indexOf(element.key) == -1 || typeof inputData[element.key] == element.type) {
            /// necessary key was not found -> leading to error
            throw new HttpsError("invalid-body", "Variable " + element.key + " was not found or has an invalid type.");
        }
    }
    /// create document in cloud firestore

    const generatedConvID = uuidv4();

    inputData["created_at"] = Timestamp.fromDate(new Date());
    inputData["uuid"] = uid;*/

  // const firestore = getFirestore();
  // firestore.collection('conv').doc(generatedConvID).set(inputData);

  /// generate prompt from given input
  /// the sytem prompt should be unbreakable.

  /// load prompt from firestore
  /// add +1 to firebase (start of interview)

  const database = getDatabase();
  await database
    .ref("realtime_data")
    .child("interview")
    .set(ServerValue.increment(1));
  let doc = await getFirestore().collection("versions").doc("prompts").get();
  let systemPrompt = doc.data()["main_prompt"];
  // let systemPrompt = createSystemPrompt({"type": "interview"});
  return {
    prompt: systemPrompt,
  };
});

exports.loadRealtimeData = onRequest(
  { cors: ["mirrorview-ai.web.app", "mirrorview-ai.firebaseapp.com"] },
  async (req, res) => {
    logger.info("Load Realtime Infos from Website");
    /// no uid is needed to fetch this information
    /// use firebase database
    const database = getDatabase();
    let snap = await database.ref("/realtime_data").get();

    /// load tokens
    var tokenSum = 0;
    let usageMap = (await database.ref("/usage").get()).val();
    Object.keys(usageMap).forEach((key) => {
      tokenSum = usageMap[key] + tokenSum;
    });

    /// 1000 -> 750 (approx.) (tokens to word)
    tokenSum = Math.round((tokenSum / 4) * 3);
    if (!snap.exists()) {
      logger.info("error");
      return res.send({
        error: "Data could not be loaded",
      });
    } else {
      let jsonData = snap.toJSON();
      if (jsonData == null) {
        logger.info("error");
        return res.send({
          error: "Data could not be loaded",
        });
      }
      /// allow debug request
      /// res.set('Access-Control-Allow-Origin', 'http://localhost:3000');
      /// allow hosting request
      res.set("Access-Control-Allow-Origin", "*");
      jsonData["words"] = tokenSum;
      return res.send(jsonData);
    }
  }
);
exports.loadPricingData = onRequest(async (req, res) => {
  /// no uid is needed to fetch this information
  /// use firebase database
  const database = getDatabase();
  let snap = await database.ref("/pricing").get();
  if (!snap.exists()) {
    return res.send({
      error: "Data could not be loaded",
    });
  } else {
    let jsonData = snap.toJSON();
    if (jsonData == null) {
      return res.send({
        error: "Data could not be loaded",
      });
    }
    /// allow debug request
    /// res.set('Access-Control-Allow-Origin', 'http://localhost:3000');
    /// allow hosting request
    res.set("Access-Control-Allow-Origin", "*");
    return res.send(jsonData);
  }
});

/// TODO: optimize string...
const htmlString = `<!DOCTYPE html><html lang="en"><head>    <meta charset="UTF-8">    <meta name="viewport" content="width=device-width, initial-scale=1.0">    <title>Welcome to MirrorView AI</title>    <style>        body {            font-family: Arial, sans-serif;            background-color: #f4f4f4;            margin: 0;            padding: 0;            color: #333;        }        .container {            width: 100%;            max-width: 600px;            margin: 0 auto;            background-color: #ffffff;            padding: 20px;            border-radius: 10px;            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);        }        h1 {            font-size: 26px;            font-weight: bold;            margin: 0 0 20px 0;            line-height: 1.2;        }        .gradient-text {            background: linear-gradient(199deg, #7812c6, #0ec2b6);            -webkit-background-clip: text; background-clip:text;           color: transparent;        }        .features {            margin: 20px 0;        }        .feature-item {            margin-bottom: 15px;        }        .feature-title {            font-size: 18px;            font-weight: bold;            color: #1ba9dc;        }        .footer {            text-align: center;            margin-top: 30px;            font-size: 14px;            color: #777;        }        a {            color: blue;            text-decoration: none;        }        .cta-button {            display: inline-block;            padding: 10px 20px;            margin-top: 20px;            background-color: #1ba9dc;            color: #ffffff;            text-align: center;            border-radius: 5px;            text-decoration: none;            font-weight: bold;        }    </style></head><body>    <div class="container">        <h1>Welcome to <span class="gradient-text">MirrorView AI</span></h1>        <p>We're thrilled to have you on board. MirrorView AI is designed to help you ace your interviews and perfect            your resume with cutting-edge AI technology.</p>        <div class="features">            <div class="feature-item"> <span class="feature-title">Simulating Interviews using AI</span>                <p>Practice your interview skills with our AI-driven simulations, tailored to help you succeed in                    real-world scenarios.</p>            </div>            <div class="feature-item"> <span class="feature-title">Resume Interrogation</span>                <p>Get AI-powered answers to all your resume-related questions. Whether it's about format, content, or                    optimization, we've got you covered.</p>            </div>            <div class="feature-item"> <span class="feature-title">Feedback & Analysis</span>                <p>Receive detailed feedback and analysis on your interview performance and resume quality to                    continuously improve and succeed.</p>            </div>        </div>        <p>If you have any questions or need assistance, feel free to <a href="mailto:reach@valentinahrend.com">contact                our support team</a>.</p> <a href="https://mirrorview-ai.firebaseapp.com/" class="cta-button">Get            Started</a>        <div class="footer">            <p>&copy; 2024 MirrorView AI. All rights reserved.</p>            <p>Darmstadt, Hesse, Germany</p>        </div>    </div></body></html>`;

exports.sendWelcomeEmail = functions.auth.user().onCreate(async (user) => {
  let displayName = user.displayName;
  let email = user.email;

  /// load current get-started-link...
  let snap = await database().ref("/get_started_link").get();
  let link = snap.val();

  firestore()
    .collection("mail")
    .add({
      to: email,
      message: {
        subject: "Welcome to MirrorView AI",
        html: htmlString.replace("ANYLINK", link),
      },
    });
});
