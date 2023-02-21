 /*
  * ERAP processing script
  * See https://github.com/cfpb/erap-data-processing for more details
  */

const counties = require( './lib/county-map.json' );
const fs = require( 'fs' );

const initializeData = ( data ) => {
  let lines = data.split( '\n' );
  const headers = lines[3].split( '\t' );

  lines.splice( 0, 4 );

  let json = [];

  lines.map( function( line ) {
    let tabs = line.split( '\t' );
    let obj = {};

    tabs.map( ( content, index ) => {
      obj[headers[index]] = content;
    } );

    json.push( obj );

  } );

  return json;
}

const getContactInfo = ( val, program ) => {
  if ( val ) {
    if ( val.startsWith( 'http' ) ){
      return ['url', val];
    } else if ( val.startsWith( 'www' ) ) {
      return ['url', 'http://' + val ];
    } else {
      return ['phone', val];
    }
  }
}

const getProgramName = ( type, item ) => {
  switch( type ) {
    case 'State':
      return item['State'];
    case 'County':
    case 'City':
      return item['City/County/ Locality'];
    case 'Tribal Government':
    case 'Territory':
      return item['Tribal Government/ Territory'];
    default:
      return item['City/County/ Locality'] ||
             item['Tribal Government/ Territory'] ||
             item['State'];
  }
}

const checkStatus = ( status ) => {
  // This string represents all the statuses we recognize.
  const statuses = 'Accepting applications - rolling basis,Applications on hold/Waitlist';

  return statuses.indexOf( status ) > -1;
};

const processPrograms = ( programs ) => {
  let results = {
    geographic:[],
    tribal:[]
  };
  let noContact = [];
  let noURL = [];
  let noCounty = [];
  let badStatus = [];
  let foo = 0;
  programs.forEach( item => {
    if ( item['Program Status'].indexOf( 'Program permanently closed' ) === -1 ) {
      let itemCopy = {};
      // Copy and rename values
      // Copy Geographic Level as Type
      let type = item['Geographic Level'];
      itemCopy['type'] = type;
      if ( checkStatus( item['Program Status'] ) ) {
        itemCopy['status'] = item['Program Status'];
      } else {
        badStatus.push( `Bad status: ${item['Program Name']}` );
      }
      // Copy State as State
      itemCopy['state'] = item['State'];
      // Set State to territory name if territory
      if ( type === 'Territory' ) {
        let val = item['Tribal Government/ Territory'];
        if ( val === 'Commonwealth of the Northern Mariana Islands' ) {
          // Rename Mariana Islands to match state name
          itemCopy['state'] = 'Northern Mariana Islands';
        } else {
          itemCopy['state'] = val;
        }
      }
      // copy Program Name as Program
      itemCopy['program'] = item['Program Name'];
      // Set Name based on type
      itemCopy['name'] = getProgramName( type, item );

      // Add county array if one exists in the county map
      if ( type === 'City' || type === 'County' ) {
        const state = item['State'];
        let stateObj = counties[state] || {};
        let county = stateObj[item['City/County/ Locality']]
        if ( county ) {
          itemCopy['county'] = county;
        }
        if (type === 'City' && !county) {
          noCounty.push( `No county: ${item['City/County/ Locality']}, ${item['State']}`)
        }
      }
      // check to see whether contact info is URL or phone
      // and set Phone or URL property
      let contact = getContactInfo(
        item['Program Page Link  (Phone # if Link is Unavailable)']
      )
      if (contact) {
        itemCopy[contact[0]] = contact[1];
        if ( contact[0] === 'phone' ) {
          noURL.push( 'No/bad URL: ', [item['Program Name'], contact[1]] )
        }
      } else {
        noContact.push(`No contact: ${item['Program Name']}`);
      }

      if ( itemCopy.type === 'Tribal Government' ) {
        results.tribal.push(itemCopy);
      } else if ( itemCopy.type === 'State' && ( itemCopy.state === 'Texas' ||
                  itemCopy.state === 'Mississippi' ) ) {
        // Temporary fix to hide closed programs
      } else {
        results.geographic.push(itemCopy);
      }    
    }
    

  })
  return {
    programs: results,
    noContact: noContact,
    noCounty: noCounty,
    noURL: noURL,
    badStatus: badStatus
  }
}



// "main" code

if ( process.argv[2] == null ) {
  console.log( 'No argument was provided! This script requires a TSV file as its sole argument.' );
} else {
  fs.readFile( process.argv[2], 'utf8' , ( err, data ) => {
    if (err) {
      console.error( err );
      return;
    }

    // process the data
    const json = initializeData( data );
    const results = processPrograms( json );
    const errArrays = [ results.noCounty, results.noContact, results.noURL, results.badStatus ];
    let errors = '';

    errArrays.forEach( arr => {
      if ( arr.length > 0 ) {
        arr.forEach( errorTxt => {
          errors += errorTxt + '\n';
        });
      }
    });

    console.log( errors );

    fs.writeFile( 'output/erap.json', JSON.stringify( results.programs, null, ' ' ), (err) => {
      if (err) throw err;
      console.log('The file has been saved!');
    })

    if ( errors.length > 0 ) {
      fs.writeFile( 'output/errors.txt', errors, (err) => {
        if (err) throw err;
        console.log('Error file has been saved!')
      });
    }

  } );

}
