/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { v4: uuidv4 } = require('uuid');
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, Timestamp, FieldValue, Filter} = require("firebase-admin/firestore");

initializeApp();

const BASE_PROMPTS = {
    interview: "You are a ROLE at FIRM conducting a STAGE-stage interview. Your primary focus is on the MAIN_TOPIC and related areas are TOPICS. Your interview style is ATTITUDE. Leverage the information provided in INSIGHTS to tailor your questions and responses. Remember to ask probing questions, challenge the candidate when appropriate, and maintain a professional and engaging demeanor throughout the interview. To simulate a realistic interview experience, feel free to introduce unexpected questions or challenges based on the candidate's responses or your understanding of the role. Additionally, consider incorporating elements of small talk, company culture, and team dynamics into the conversation. The interview concludes when the candidate says 'END INTERVIEW'. Upon receiving this command, provide a brief summary of the candidate's strengths and areas for improvement based on the interview. "
}

function summarize(topics_array) {
    var ts = "";
    for (let index = 0; index < topics_array.length; index++) {
        const topic = topics_array[index];
        ts += topic;
        if(index == topics_array.length - 2) {
            ts += " and "
        }else{
            if(index < topics_array.length - 2) {
                ts += ", "
            }
        }
    }
    return ts;
}

const createSystemPrompt = (configuration) => {
    if(configuration["type"] == "interview") {
        /// use interview prompt.
        var base_prompt = BASE_PROMPTS.interview;
        /// get important data from insights...
        let insights = configuration["insights"];
        if("firm" in Object.keys(insights)) {
            base_prompt = base_prompt.replace("FIRM", insights["firm"]);
            delete configuration["insights"]["firm"];
        }else{
            base_prompt = base_prompt.replace("FIRM", "a company");
        }
        if("role" in Object.keys(insights)) {
            base_prompt = base_prompt.replace("ROLE", insights["role"]);
            delete configuration["insights"]["role"];
        }else{
            base_prompt = base_prompt.replace("ROLE", "hiring manager");
        }
        base_prompt = base_prompt.replace("MAIN_TOPIC", configuration["mainTopic"]);
        base_prompt = base_prompt.replace("TOPICS", summarize(configuration["topics"]))
        let finished_prompt = base_prompt + JSON.stringify(configuration["insights"]);
    }
}

const CONFIGURATIONS = {
    params: [
        {
            /// the attitude of the character
            key: "attitude",
            type: "string"
        },
        {
            /// the type of roleplay (e.g. interview, custom, evaluation, presentation, deal, connecting)
            key: "type",
            type: "string"
        },
        {
            /// the main topic of the conversation (use depends on type of roleplay)
            key: "mainTopic",
            type: "string"
        },
        {
            /// other needed topics (use depends on type of roleplay)
            key: "topics",
            type: "object"
        },
        {
            /// insights useful for the conversation (use depends on type of roleplay)
            key: "insights",
            type: "object"
        },
        {
            /// the maximum time the conversation takes
            key: "maxTime",
            type: "number"
        }
    ]
}

exports.startConversation = onCall((req, res) => {
    logger.info("Called Start Conversation in Cloud Functions");
    const uid = req.auth.uid;
    /// this function is only available for signed in users (with an uid)
    if(uid == undefined || uid == null || !(typeof uid == "string")) {
        throw new HttpsError("invalid-credentials", "Not allowed");
    }
    /// check given parameters
    var inputData = req.rawRequest.body;
    if(typeof inputData == "string") {
        /// not serialized
        inputData = JSON.parse(inputData);
    }else{
        if(typeof inputData != "object") {
            throw new HttpsError("invalid-body", "Not allowed");
        }
    }

    /// generate prompt from given input
    /// the sytem prompt should be unbreakable.
    let systemPrompt = createSystemPrompt(inputData);
    return res.send({
        "conv_id": generatedConvID,
        "conv_data": inputData,
        "prompt": systemPrompt
    })
});
