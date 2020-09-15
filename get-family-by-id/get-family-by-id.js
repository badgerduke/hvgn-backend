const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient({
  apiVersion: "2012-10-08",
  region: "us-east-1"
  /*     region: 'localhost',
    endpoint: "http://localhost:8000", */
});
//const docClient = ddb.DocumentClient();
const completeDateRegex = new RegExp(
  /^((\d{2})\s)?((JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s)?(\d{4})$/
);
//const privatizeStartYear = process.env.PRIVATE_YEAR;
//const hvgnTableName = process.env.HVGN_TABLE;
const privatizeStartYear = 1920;
const hvgnTableName = "hvgn-dev";


const allowedOrigin = process.env.ALLOWED_ORIGIN;

module.exports.handler = async function(event, context) {
  const bodyToReturn = { parents: [], children: [] };
  const familyId = event.pathParameters.id;
  const response = {};
  console.log("Allowed origin should be * = " + allowedOrigin);
  response.headers = { "Access-Control-Allow-Origin": allowedOrigin };

  try {
    const familyData = await getItemsByPK(
      hvgnTableName,
      `F${familyId}`
    );

    // console.log(`data = ${JSON.stringify(familyData)}`);  

/*     {"Items":
    [{"FAM":"F772","AIN":"I2094","PIN":"P2","VERS":1,"SK":"A2094#1","PK":"F1","TYPE":"FA","NAME":"Lana Unknown "}
    ,{"FAM":"F2","AIN":"I6","PIN":"P2","VERS":1,"SK":"A6#1","PK":"F1","TYPE":"FA","NAME":"Sarah Elizabeth Huelster "},
    {"BDT":"11 FEB 1971","NAT":"true","GNM":"John Eric","SEX":"M","VERS":1,"USER":"me_eric","SK":"C1","PK":"F1","SUR":"Hamacher","TYPE":"FC"}
    ,{"BDT":"28 AUG 1963","NAT":"true","GNM":"Christine Elizabeth","SEX":"F","VERS":1,"USER":"me_eric","SK":"C4","FMS":["F3"],"PK":"F1","SUR":"Hamacher","TYPE":"FC"},
    {"BDT":"17 NOV 1965","NAT":"true","GNM":"Andrea Lynn","SEX":"F","VERS":1,"USER":"me_eric","SK":"C5","FMS":["F4"],"PK":"F1","SUR":"Hamacher","TYPE":"FC"},
    {"USER":"me_eric","SK":"D","PK":"F1","MDT":"09 JUN 1962","TYPE":"FD","VERS":1},
    {"LNS":"Marriage Details: 502, 506","USER":"me_eric","SK":"N770","PK":"F1","TYPE":"FN","VERS":1},
    {"BDT":"09 SEP 1938","GNM":"John Eugene","SEX":"M","FOO":"F5","VERS":1,"BLC":"Madison, Wisconsin.","USER":"me_eric","SK":"P2","FMS":["F1","F2","F772"],"PK":"F1","SUR":"Hamacher","TYPE":"FP"},
    {"BDT":"28 SEP 1940","GNM":"Marjorie Ellen","SEX":"F","FOO":"F11","VERS":1,"BLC":"Albuquerque, New Mexico.","USER":"me_eric","SK":"P3","FMS":["F1"],"PK":"F1","SUR":"Patek","TYPE":"FP"}
  ],"Count":9,"ScannedCount": 9}*/

     if (familyData.Items.length === 0) {
      // We need it find an item, throw a 404.
      response.statusCode = 404;
      response.body = `Family with familyId of 'F${familyId}' was not found`;
    } 
    else {
      const parentsData = transformParentData(familyData);
      transformAltPartnerData(familyData, parentsData);
      bodyToReturn.children = transformChildrenData(familyData)
      bodyToReturn.parents = parentsData;
    }

/*      bodyToReturn.familyId = familyId;
      const father = familyData.Item.HUSB;
      const mother = familyData.Item.WIFE;
      let fatherPromise;
      let motherPromise;
      let childrenPromise;
      let fatherOtherFamiliesPromise;
      let motherOtherFamiliesPromise;
      let fatherData;
      let motherData;
      let fatherOtherFamiliesData;
      let motherOtherFamiliesData;
      let fatherOtherFamiliesProimise;
      let motherOtherFamiliesProimise;

      if (father) {
        fatherPromise = getItem(
          individualTableName,
          "INDVID, FAMC, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC",
          ddbKey("INDVID", father)
        );
      }
      if (mother) {
        motherPromise = getItem(
          individualTableName,
          "INDVID, FAMC, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC",
          ddbKey("INDVID", mother)
        );
      }
      childrenPromise = queryByGsi(childrenTableName, childrenTableName + "-familyIdGSI", "FAMID = :a", {
        ":a": familyId
      });

      if (father) {
        fatherOtherFamiliesPromise = queryByGsi(
          familyTableName,
          familyTableName + "-fatherIdGSI",
          "HUSB = :a",
          { ":a": father }
        );
      }

      if (mother) {
        motherOtherFamiliesPromise = queryByGsi(
          familyTableName,
          familyTableName + "-motherIdGSI",
          "WIFE = :a",
          { ":a": mother }
        );
      }

      if (father) {
        fatherData = await fatherPromise;
      }
      if (mother) {
        motherData = await motherPromise;
      }
      const childrenData = await childrenPromise;

      if (father) {
        fatherOtherFamiliesData = await fatherOtherFamiliesPromise;
      }
      if (mother) {
        motherOtherFamiliesData = await motherOtherFamiliesPromise;
      }

      if (father) {
        fatherOtherFamiliesProimise = constructParentOtherFamiliesData(
          fatherOtherFamiliesData,
          "WIFE",
          familyId
        );
      }
      if (mother) {
        motherOtherFamiliesProimise = constructParentOtherFamiliesData(
          motherOtherFamiliesData,
          "HUSB",
          familyId
        );
      }
      const childrenDataPromise = constructChildrenData(childrenData);

      if (father) {
        fatherData.Item.otherFamilies = await fatherOtherFamiliesProimise;
      }
      if (mother) {
        motherData.Item.otherFamilies = await motherOtherFamiliesProimise;
      }

      bodyToReturn.children = await childrenDataPromise;

      if (father) {
        bodyToReturn.parents.push(
          extractParentInformation(privatizeIndividual(fatherData.Item))
        );
      }
      if (mother) {
        bodyToReturn.parents.push(
          extractParentInformation(privatizeIndividual(motherData.Item))
        );
      }
    } */
  } catch (err) {
    console.log(err);
    response.statusCode = 500;
    response.body = JSON.stringify(err);
  }

  if (!response.statusCode) {
    response.statusCode = 200;
    response.body = JSON.stringify(bodyToReturn);
  }

  console.log(JSON.stringify(response));
  return response;
};

let ddbKey = (
  partitionKeyName,
  partitionKeyValue,
  sortKeyName,
  sortKeyValue
) => {
  const key = {};
  key[partitionKeyName] = partitionKeyValue;
  if (sortKeyName) {
    key[sortKeyName] = sortKeyValue;
  }
  return key;
};

const transformAltPartnerData = (familyData, parentsArray) => {

  familyData.Items.forEach(item => {
    if (item.TYPE === 'FA') {
      parentsArray.forEach(parent => {
        console.log(`PIN: ${item.PIN}, SK: ${parent.id}`);
        if (item.PIN === parent.id) {
          parent.otherFamilies.push({
            familyId: item.FAM.substring(1, item.FAM.length),
            spouseName: item.NAME
          })
        }
      })
    }
  });
}

const transformParentData = (familyData, altPartnersData) => {
  const parentsArray = [];

  const parentsData = familyData.Items.filter( item => {
    return item.TYPE === 'FP';
  })

  if (parentsData.length === 2) {
    if (parentsData[0].SEX === 'M') {
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[1])));
    }
    else if (parentsData[1].SEX === 'M') {
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[1])));
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
    }
    else if (parentsData[0].SEX === 'F') {
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[1])));
    }
    else if (parentsData[1].SEX === 'F') {
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[1])));
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
    }
    else {
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[1])));
    }
  }
  else if (parentsData.length === 1) {
    parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
  }
  return parentsArray;

};

let privatizeIndividual = individualItem => {
  let returnedItem = {};
  Object.assign(returnedItem, individualItem);

  let birthdate = individualItem.BDT;
  if (completeDateRegex.test(birthdate)) {
    const birthdateRegexMatches = birthdate.match(completeDateRegex);
    //console.log("birth year = " + birthdateRegexMatches[5]);
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

let extractParentInformation = function(parentItem) {
  //{"BDT":"09 SEP 1938","GNM":"John Eugene","SEX":"M","FOO":"F5","VERS":1,"BLC":"Madison, Wisconsin.","USER":"me_eric","SK":"P2","FMS":["F1","F2","F772"],"PK":"F1","SUR":"Hamacher","TYPE":"FP"}
  const parent = {};
  parent.id = parentItem.SK;
  parent.surname = parentItem.SUR;
  parent.givenName = parentItem.GNM;
  parent.suffix = parentItem.SUF;
  parent.gender = parentItem.SEX;
  parent.birthdate = parentItem.BDT;
  parent.birthloc = parentItem.BLC;
  parent.deathdate = parentItem.DDT;
  parent.deathloc = parentItem.DLC;
  parent.familyOfOrigin = parentItem.FOO.substring(1, parentItem.FOO.length);
  parent.otherFamilies = [];
  return parent;
};

const transformChildrenData = (familyData) => {
  const children = [];

  familyData.Items.forEach(item => {
    if (item.TYPE === 'FC') {
      const fms = item.FMS;
      let familyIdToDisplay = null;
      if (fms) {
        familyIdToDisplay = getMinimumInArray(fms);
      }
      const privatizedChild = privatizeIndividual(item);
      children.push({
        childId: privatizedChild.SK.substring(1, item.SK.length),
        surname: privatizedChild.SUR,
        givenName: privatizedChild.GNM,
        suffix: privatizedChild.SUF,
        birthdate: privatizedChild.BDT,
        sex: privatizedChild.SEX,
        naturalOfParents: privatizedChild.NAT,
        familyIdToDisplay: familyIdToDisplay
      })
    }
  });

  return children;
};


/* let extractNaturalFromChildren = function(childrenTableItems, childId) {
  let natural = {};

  for (let i = 0; i < childrenTableItems.length; i++) {
    if (childId === childrenTableItems[i].CHILDID) {
      natural.father = childrenTableItems[i]._FREL;
      natural.mother = childrenTableItems[i]._MREL;
    }
  }

  return natural;
}; */

let getMinimumInArray = function(array) {
  if (array && array.length) {
    array.sort((a, b) => Number(a.substring(1, a.length)) - Number(b.substring(1, b.length)));
    return Number(array[0].substring(1, array[0].length));
  } else {
    return null;
  }
};

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

/* let constructParentOtherFamiliesData = (
  parentOtherFamiliesData,
  otherTableAttribute,
  currentFamilyId
) => {
  return new Promise(async (resolve, reject) => {
    const parentOtherSpousesPromises = [];
    const parentOtherFamilies = [];
    let parentOtherSpouseData = [];

    try {
      for (let i = 0; i < parentOtherFamiliesData.Items.length; i++) {
        parentOtherSpousesPromises.push(
          getItem(
            individualTableName,
            "INDVID, GIVEN, SURN, SUFF",
            ddbKey(
              "INDVID",
              parentOtherFamiliesData.Items[i][otherTableAttribute]
            )
          )
        );
      }

      for (let j = 0; j < parentOtherSpousesPromises.length; j++) {
        parentOtherSpouseData = await parentOtherSpousesPromises[j];
        const familyId = parentOtherFamiliesData.Items[j].FAMID;
        if (familyId !== currentFamilyId) {
          parentOtherFamilies.push({
            familyId: familyId,
            spouseName: `${parentOtherSpouseData.Item.GIVEN} ${parentOtherSpouseData.Item.SURN}`
          });
        }
      }
    } catch (err) {
      reject(err);
    }
    resolve(parentOtherFamilies);
  });
}; */

/* let constructChildrenData = childrenData => {
  return new Promise(async (resolve, reject) => {
    const childDataPromises = [];
    const childData = [];
    const children = [];

    try {
      for (let i = 0; i < childrenData.Items.length; i++) {
        childDataPromises.push(
          getItem(
            individualTableName,
            "INDVID, FAMS, GIVEN, SURN, SUFF, SEX, BIRTDATE, DEATDATE",
            ddbKey("INDVID", childrenData.Items[i].CHILDID)
          )
        );
      }

      for (let j = 0; j < childDataPromises.length; j++) {
        singleChildData = await childDataPromises[j];
        childData.push(privatizeIndividual(singleChildData.Item));
      }

      for (let k = 0; k < childData.length; k++) {
        const childId = childData[k].INDVID;
        const natural = extractNaturalFromChildren(childrenData.Items, childId);
        const fams = childData[k].FAMS;
        let familyIdToDisplay = null;
        if (fams) {
          familyIdToDisplay = getMinimumInArray(fams.values);
        }
        children.push({
          childId: childId,
          surname: `${childData[k].SURN}`,
          givenName: `${childData[k].GIVEN}`,
          suffix: `${childData[k].SUFF}`,
          birthdate: childData[k].BIRTDATE,
          sex: childData[k].SEX,
          naturalOfFather: natural.father,
          naturalOfMother: natural.mother,
          familyIdToDisplay: familyIdToDisplay
        });
      }
    } catch (err) {
      reject(err);
    }
    resolve(children);
  });
}; */
