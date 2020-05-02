const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient({
  apiVersion: "2012-10-08",
  region: "us-east-1"
});
const completeDateRegex = new RegExp(
  /^((\d{2})\s)?((JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s)?(\d{4})$/
);
const privatizeStartYear = process.env.PRIVATE_YEAR;
const individualTableName = process.env.INDIVIDUAL_TABLE;
const noteTableName = process.env.NOTE_TABLE;
const allowedOrigin = process.env.ALLOWED_ORIGIN;

module.exports.handler = async function(event, context) {
  const bodyToReturn = { };
  const inidividualId = event.pathParameters.id;
  const response = {};
  console.log("Allowed origin should be * = " + allowedOrigin);
  response.headers = { "Access-Control-Allow-Origin": allowedOrigin };

  try {
    const individual = await getItem(
        individualTableName,
        "INDVID, FAMS, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC, NOTE, FAMC",
        ddbKey("INDVID", inidividualId)
    );
    const privateIndividual = extractIndividualInformation(privatizeIndividual(individual.Item));
    Object.assign(bodyToReturn, privateIndividual);
    const noteId = individual.Item.NOTE;
    if (noteId) {
      const notes = await getItem(
          noteTableName,
          "NOTEID, NOTES",
          ddbKey("NOTEID", noteId)
      );
      
      const notesArray = notes.Item.NOTES.split("\n");
      bodyToReturn.notes = notesArray;
    }

    

  } catch (err) {
    response.statusCode = 500;
    response.body = JSON.stringify(err);
  }

  if (!response.statusCode) {
    response.statusCode = 200;
    response.body = JSON.stringify(bodyToReturn);
  }

  return response;
    
};

let extractIndividualInformation = function(individualData) {
  const inidividual = {};
  inidividual.id = individualData.INDVID;
  inidividual.givenName = individualData.GIVEN;
  inidividual.surname = individualData.SURN;
  inidividual.gender = individualData.SEX;
  inidividual.birthdate = individualData.BIRTDATE;
  inidividual.birthLocation = individualData.BIRTPLAC;
  inidividual.deathdate = individualData.DEATDATE;
  inidividual.deathLocation = individualData.DEATPLAC;
  inidividual.familyOfOrigin = individualData.FAMC;
  if (individualData.FAMS) {
    inidividual.firstFamilyStarted = getMinimumInArray(individualData.FAMS.values);
  }
  return inidividual;
};

let getMinimumInArray = function(array) {
  if (array && array.length) {
    array.sort((a, b) => a - b);
    return JSON.stringify(Number(array[0]));
  } else {
    return null;
  }
};

let privatizeIndividual = individualItem => {
  let returnedItem = {};
  Object.assign(returnedItem, individualItem);
  let birthdate = individualItem.BIRTDATE;
  if (completeDateRegex.test(birthdate)) {
    const birthdateRegexMatches = birthdate.match(completeDateRegex);
    let deathdate = individualItem.DEATDATE;
    if (
      privatizeStartYear - 1 < Number(birthdateRegexMatches[5]) &&
      (deathdate == "" || !completeDateRegex.test(deathdate))
    ) {
      returnedItem.BIRTDATE = "Private";
      if (individualItem.BIRTPLAC) {
        returnedItem.BIRTPLAC = "Private";
      }
    }
  }
  return returnedItem;
};





let ddbKey = (partitionKeyName, partitionKeyValue, sortKeyName, sortKeyValue) => {
    const key = {};
    key[partitionKeyName] = partitionKeyValue;
    if (sortKeyName) {
      key[sortKeyName] = sortKeyValue;
    }
    return key;
};
  
let getItem = (tableName, projectExpression, ddbKey) => {
    return new Promise((resolve, reject) => {
      docClient.get({
        TableName: tableName,
        Key: ddbKey,
        ProjectionExpression: projectExpression,
        ConsistentRead: false
      }, 
      (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        };
      });
    });
  };
  
