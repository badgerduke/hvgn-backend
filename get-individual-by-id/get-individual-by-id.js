const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient({
  apiVersion: "2012-10-08",
  region: "us-east-1"
});
const completeDateRegex = new RegExp(
  /^((\d{2})\s)?((JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s)?(\d{4})$/
);
const privatizeStartYear = process.env.PRIVATE_YEAR;

module.exports.handler = async function(event, context) {
  const bodyToReturn = { };
  const inidividualId = event.pathParameters.id;
  const response = {};

  try {
    const individual = await getItem(
        "Individual",
        "INDVID, FAMS, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC, NOTE",
        ddbKey("INDVID", inidividualId)
    );
    const privateIndividual = extractIndividualInformation(privatizeIndividual(individual.Item));
    Object.assign(bodyToReturn, privateIndividual);
    console.log(`inidividual ${JSON.stringify(individual)}`);
    const noteId = individual.Item.NOTE;
    console.log(`note id ${noteId}`);
    if (noteId) {
      const notes = await getItem(
          "Note",
          "NOTEID, NOTES",
          ddbKey("NOTEID", noteId)
      );
      
      const notesArray = notes.Item.NOTES.split("\n");
      bodyToReturn.notes = notesArray;

      console.log(JSON.stringify(notes));
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
  return inidividual;
};

let privatizeIndividual = individualItem => {
  console.log("in privatizeIndividual");
  let returnedItem = {};
  Object.assign(returnedItem, individualItem);
  console.log(`returnedItem = ${JSON.stringify(returnedItem)}`);
  console.log(`privatizeStartYear = ${JSON.stringify(privatizeStartYear)}`);
  let birthdate = individualItem.BIRTDATE;
  if (completeDateRegex.test(birthdate)) {
    const birthdateRegexMatches = birthdate.match(completeDateRegex);
    console.log("birth year = " + birthdateRegexMatches[5]);
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
    console.log("returnedItem = " + JSON.stringify(returnedItem));
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
          console.log(`getItem returned data`);
          resolve(data);
        };
      });
    });
  };
  
