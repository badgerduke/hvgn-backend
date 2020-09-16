const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient({
  apiVersion: "2012-10-08",
  region: "us-east-1"
});
const completeDateRegex = new RegExp(
  /^((\d{2})\s)?((JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s)?(\d{4})$/
);
const privatizeStartYear = process.env.PRIVATE_YEAR;
const hvgnTableName = process.env.HVGN_TABLE;
const allowedOrigin = process.env.ALLOWED_ORIGIN;

module.exports.handler = async function(event, context) {
  const bodyToReturn = { };
  const inidividualId = event.pathParameters.id;
  const response = {};
  console.log("Allowed origin should be * = " + allowedOrigin);
  response.headers = { "Access-Control-Allow-Origin": allowedOrigin };

  try {
    const individualData = await getItemsByPK(
        hvgnTableName,
        `I${inidividualId}`
    );
    console.log(`indivoudal = ${JSON.stringify(individualData)}`);

 /*    {"Items":[{"BDT":"24 JUN 1911","GNM":"Mildred Lucilla","SEX":"F","FOO":"F26","VERS":1,"BLC":"Green County, Wisconsin.","USER":"me_eric","SK":"D","FMS":["F5"],"PK":"I13","SUR":"Gempeler","TYPE":"ID"},
    {"LNS":"Brown eyes & brown hair.\n504:  Smoked with friends after parents went to bed.\n504:  Attended Brodhead High.\n???:  In 1919, family moved into Brodhead.\n504:  Social smoker.\n405:  In 1970, residence as Middleton.\n436:  Residence as Verona, WI\n404:  In 1960, residence as Madison.\n436:  In 1997, residence as Verona.\n238:  Occupation as bookkeeper with Madison Hardware Co.\n238:  Residence as 106 East Lakeside (Madison, WI)\n734:  Residence as Madison, WI","USER":"me_eric","SK":"N8","PK":"I13","TYPE":"IN","VERS":1}],
    "Count":2,"ScannedCount":2} */

    const transformedIndividual = transformIndividual(individualData);
    if (transformedIndividual) {
      Object.assign(bodyToReturn, transformedIndividual);
      bodyToReturn.notes = transformIndividualNotes(individualData);
    }
    else {
      response.statusCode = 404;
      response.body = JSON.stringify(`Individual with id '${inidividualId}' not found`);
    }
  } catch (err) {
    response.statusCode = 500;
    response.body = JSON.stringify(err);
  }

  if (!response.statusCode) {
    response.statusCode = 200;
    response.body = JSON.stringify(bodyToReturn);
  }
  console.log(`response = ${JSON.stringify(response)}`);
  return response;
    
};

const transformIndividual = (individualData) => {

  let individualToReturn = null; 

  individualData.Items.forEach((item) => {
    if (item.TYPE === 'ID') {
      individualToReturn = extractIndividualInformation(privatizeIndividual(item));
    }
  });

  return individualToReturn;
};

const transformIndividualNotes = (individualData) => {

  let notesArray = null;

  individualData.Items.forEach((item) => {
    if (item.TYPE === 'IN') {
      if (item.LNS) {
        notesArray = item.LNS.split("\n");
      }
    }
  });

  return notesArray;
};

let extractIndividualInformation = function(individualData) {
  const inidividual = {};
  inidividual.id = individualData.SK.substring(1, individualData.SK.length);
  inidividual.givenName = individualData.GNM;
  inidividual.surname = individualData.SUR;
  inidividual.gender = individualData.SEX;
  inidividual.birthdate = individualData.BDT;
  inidividual.birthLocation = individualData.BLC;
  inidividual.deathdate = individualData.DDT;
  inidividual.deathLocation = individualData.DLC;
  inidividual.familyOfOrigin = individualData.FOO;
  if (individualData.FMS) {
    inidividual.firstFamilyStarted = getMinimumInArray(individualData.FMS);
  }
  return inidividual;
};

let getMinimumInArray = function(array) {
  if (array && array.length) {
    array.sort((a, b) => Number(a.substring(1, a.length)) - Number(b.substring(1, b.length)));
    return Number(array[0].substring(1, array[0].length));
  } else {
    return null;
  }
};

let privatizeIndividual = individualItem => {
  let returnedItem = {};
  Object.assign(returnedItem, individualItem);
  let birthdate = individualItem.BDT;
  if (completeDateRegex.test(birthdate)) {
    const birthdateRegexMatches = birthdate.match(completeDateRegex);
    let deathdate = individualItem.DDT;
    if (
      privatizeStartYear - 1 < Number(birthdateRegexMatches[5]) &&
      (deathdate == "" || !completeDateRegex.test(deathdate))
    ) {
      returnedItem.BDT = "Private";
      if (individualItem.BLC) {
        returnedItem.BLC = "Private";
      }
    }
  }
  return returnedItem;
};





/* let ddbKey = (partitionKeyName, partitionKeyValue, sortKeyName, sortKeyValue) => {
    const key = {};
    key[partitionKeyName] = partitionKeyValue;
    if (sortKeyName) {
      key[sortKeyName] = sortKeyValue;
    }
    return key;
}; */

let getItemsByPK = (tableName, partitionKey) => {
  return new Promise((resolve, reject) => {
    try {
      docClient.query(
        {
          TableName: tableName,
          KeyConditionExpression: 'PK = :hkey',
          ExpressionAttributeValues: {
            ':hkey': partitionKey
          }
        },
        (err, data) => {
          if (err) {
            reject(err);
          } else {
            console.log(`getItem returned data`);
            resolve(JSON.parse(JSON.stringify(data)));
          }
        }
      );
    } catch (err) {
      reject(err);
    }
  });
};
  
/* let getItem = (tableName, projectExpression, ddbKey) => {
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
  }; */
  
