// Data used: https://public.opendatasoft.com/explore/assets/geonames-all-cities-with-a-population-1000/view

let d = document;
d.id = d.getElementById;

EventTarget.prototype.listen = function(t, f) {
    this.addEventListener(t, f);
};

let mouseX = 0;
let mouseY = 0;
let autoStart = true;
let allCities = [];
let currCitiesList = [];
let currCity;
let inTransition = false;
let currCountriesList = [];
let currCountryMap = "";
let minPopulation = Number(d.id("min-population").value);
let maxPopulation = Number(d.id("max-population").value);
let minBeforeRepeat = Number(d.id("locs-before-repeat").value);
let removedCities = [];
let deepRemovedCities = []; // Deep removed cities can't be restored with R
let removedSatellites = []; // Removed satellites can't be removed with keys at all (prevents having to click again)
let locHistory = [];
let pastMarkerCoords = [];
let showingClickMarker;
let showingLocMarker;
//let showAllLocs = false;
let allLocMarkers = [];
let regionColorsDict = {};
let showMedCountries = false;
let selectedFeatureCountries = [];
let selectingCountriesForMap = false;
let useBlueMarbleGlobe = d.id("checkbox-blue-marble-map").checked;
let maptapSubdivisions = d.id("checkbox-maptap-subdivisions").checked;
let numTimesGuessedCorrect = {};

let convertToType = {
    "n": x => Number(x),
    "b": x => typeof x === "string" ? (x === "true") : Boolean(x),
    "s": x => String(x),
    "o": x => {
        try {
            return JSON.parse(x);
        } catch (e) {
            console.error(`JSON parse failed, x="${x}"`, e.message);
            return [];
        }
    },
};

let settings = {
    "globeBrightness": {"val": 1, "id": "globe-brightness-slider", "type": "n", "textId": "globe-brightness-value"},
    "scoringDiff": {"val": 1, "id": "scoring-diff-slider", "type": "n", "textId": "scoring-diff-value"},
    "fadeTime": {"val": 1000, "id": "location-fade-slider", "type": "n", "textId": "location-fade-value"},
    "autoRemove": {"val": false, "id": "checkbox-auto-remove", "type": "b"},
    "autoRemoveDist": {"val": 40, "id": "auto-remove-dist", "type": "n"},
    "autoRemoveTimes": {"val": 2, "id": "auto-remove-num-times", "type": "n"},
    "showDivision": {"val": true, "id": "checkbox-division-name", "type": "b"},
    "showCountry": {"val": false, "id": "checkbox-country-name", "type": "b"},
    "showPopulation": {"val": false, "id": "checkbox-city-pop", "type": "b"},
    "showOutline": {"val": true, "id": "checkbox-outline", "type": "b"},
    "outlineDivisions": {"val": true, "id": "checkbox-outline-subdivisions", "type": "b"},
    "maptapSubdivisions": {"val": false, "id": "checkbox-maptap-subdivisions", "type": "b"},
    "minPopulation": {"val": 100000, "id": "min-population", "type": "n"},
    "maxPopulation": {"val": 50000000, "id": "max-population", "type": "n"},
    "minBeforeRepeat": {"val": 10, "id": "locs-before-repeat", "type": "n"},
    "customMapArr": {"val": [], "id": null, "type": "o"},
    "countryMapVal": {"val": "china", "id": null, "type": "s"}
}

for (let k in settings) {
    let item = localStorage.getItem(k);
    if (item !== null && item !== "") {
        settings[k].val = convertToType[settings[k].type](item);
    } else {
        let setVal = (typeof settings[k].val) === "string" ? settings[k].val : JSON.stringify(settings[k].val);
        localStorage.setItem(k, setVal);
    }

    if (settings[k]["id"]) {
        let elem = d.id(settings[k].id);
        if (elem.type === "checkbox") {
            d.id(settings[k].id).checked = settings[k].val;
        } else {
            d.id(settings[k].id).value = settings[k].val;
        }
    }

    if (Object.hasOwn(settings[k], "textId")) {
        d.id(settings[k].textId).innerText = settings[k].val;
    }
}

function setSetting(k, v) {
    localStorage.setItem(k, v);
    settings[k].val = convertToType[settings[k].type](v);

    if (Object.hasOwn(settings[k], "textId")) {
        d.id(settings[k].textId).innerText = settings[k].val;
    }
}


// To do: Clean up all repeated setSettingFromEvent code in event listeners
function setSettingFromEvent(e) {
    let id = e.currentTarget.id;
    let setting = Object.entries(settings).filter(x => x[1].id === id);
    if (setting.length === 0) return;

    let obj = setting[0];
    if (d.id(id).type === "checkbox") {
        setSetting(obj[0], d.id(id).checked);
    } else {
        setSetting(obj[0], d.id(id).value);
    }
}

let iso2ToCountryName = {"AF":"Afghanistan","AX":"Aland Islands","AL":"Albania","DZ":"Algeria","AS":"American Samoa","AD":"Andorra","AO":"Angola","AI":"Anguilla","AQ":"Antarctica","AG":"Antigua and Barbuda","AR":"Argentina","AM":"Armenia","AW":"Aruba","AU":"Australia","AT":"Austria","AZ":"Azerbaijan","BS":"Bahamas","BH":"Bahrain","BD":"Bangladesh","BB":"Barbados","BY":"Belarus","BE":"Belgium","BZ":"Belize","BJ":"Benin","BM":"Bermuda","BT":"Bhutan","BO":"Bolivia","BA":"Bosnia and Herzegovina","BW":"Botswana","BV":"Bouvet Island","BR":"Brazil","IO":"British Indian Ocean Territory","BN":"Brunei","BG":"Bulgaria","BF":"Burkina Faso","BI":"Burundi","KH":"Cambodia","CM":"Cameroon","CA":"Canada","CV":"Cape Verde","KY":"Cayman Islands","CF":"Central African Republic","TD":"Chad","CL":"Chile","CN":"China","CX":"Christmas Island","CC":"Cocos (Keeling) Islands","CO":"Colombia","KM":"Comoros","CG":"Rep. of the Congo","CD":"Dem. Rep. of the Congo","CK":"Cook Islands","CR":"Costa Rica","CI":"Cote D'Ivoire","HR":"Croatia","CU":"Cuba","CY":"Cyprus","CZ":"Czech Republic","DK":"Denmark","DJ":"Djibouti","DM":"Dominica","DO":"Dominican Republic","EC":"Ecuador","EG":"Egypt","SV":"El Salvador","GQ":"Equatorial Guinea","ER":"Eritrea","EE":"Estonia","ET":"Ethiopia","FK":"Falkland Islands (Malvinas)","FO":"Faroe Islands","FJ":"Fiji","FI":"Finland","FR":"France","GF":"French Guiana","PF":"French Polynesia","TF":"French Southern Territories","GA":"Gabon","GM":"The Gambia","GE":"Georgia","DE":"Germany","GH":"Ghana","GI":"Gibraltar","GR":"Greece","GL":"Greenland","GD":"Grenada","GP":"Guadeloupe","GU":"Guam","GT":"Guatemala","GG":"Guernsey","GN":"Guinea","GW":"Guinea-Bissau","GY":"Guyana","HT":"Haiti","HM":"Heard Island and McDonald Islands","VA":"Vatican City","HN":"Honduras","HK":"Hong Kong","HU":"Hungary","IS":"Iceland","IN":"India","ID":"Indonesia","IR":"Iran","IQ":"Iraq","IE":"Ireland","IM":"Isle of Man","IL":"Israel","IT":"Italy","JM":"Jamaica","JP":"Japan","JE":"Jersey","JO":"Jordan","KZ":"Kazakhstan","KE":"Kenya","KI":"Kiribati","KP":"North Korea","KR":"South Korea","XK":"Kosovo","KW":"Kuwait","KG":"Kyrgyzstan","LA":"Laos","LV":"Latvia","LB":"Lebanon","LS":"Lesotho","LR":"Liberia","LY":"Libya","LI":"Liechtenstein","LT":"Lithuania","LU":"Luxembourg","MO":"Macao","MK":"North Macedonia","MG":"Madagascar","MW":"Malawi","MY":"Malaysia","MV":"Maldives","ML":"Mali","MT":"Malta","MH":"Marshall Islands","MQ":"Martinique","MR":"Mauritania","MU":"Mauritius","YT":"Mayotte","MX":"Mexico","FM":"Micronesia","MD":"Moldova","MC":"Monaco","MN":"Mongolia","ME":"Montenegro","MS":"Montserrat","MA":"Morocco","MZ":"Mozambique","MM":"Myanmar","NA":"Namibia","NR":"Nauru","NP":"Nepal","NL":"Netherlands","AN":"Netherlands Antilles","NC":"New Caledonia","NZ":"New Zealand","NI":"Nicaragua","NE":"Niger","NG":"Nigeria","NU":"Niue","NF":"Norfolk Island","MP":"Northern Mariana Islands","NO":"Norway","OM":"Oman","PK":"Pakistan","PW":"Palau","PS":"Palestine","PA":"Panama","PG":"Papua New Guinea","PY":"Paraguay","PE":"Peru","PH":"Philippines","PN":"Pitcairn","PL":"Poland","PT":"Portugal","PR":"Puerto Rico","QA":"Qatar","RE":"Reunion","RO":"Romania","RU":"Russia","RW":"Rwanda","BL":"Saint Barthelemy","SH":"Saint Helena","KN":"Saint Kitts and Nevis","LC":"Saint Lucia","MF":"Saint Martin","PM":"Saint Pierre and Miquelon","VC":"Saint Vincent and the Grenadines","WS":"Samoa","SM":"San Marino","ST":"Sao Tome and Principe","SA":"Saudi Arabia","SN":"Senegal","RS":"Serbia","SC":"Seychelles","SL":"Sierra Leone","SG":"Singapore","SK":"Slovakia","SI":"Slovenia","SB":"Solomon Islands","SO":"Somalia","ZA":"South Africa","GS":"South Georgia and the South Sandwich Islands","ES":"Spain","LK":"Sri Lanka","SD":"Sudan","SR":"Suriname","SJ":"Svalbard and Jan Mayen","SZ":"Eswatini","SE":"Sweden","SS":"South Sudan","CH":"Switzerland","SY":"Syria","TW":"Taiwan","TJ":"Tajikistan","TZ":"Tanzania","TH":"Thailand","TL":"Timor-Leste","TG":"Togo","TK":"Tokelau","TO":"Tonga","TT":"Trinidad and Tobago","TN":"Tunisia","TR":"Turkey","TM":"Turkmenistan","TC":"Turks and Caicos Islands","TV":"Tuvalu","UG":"Uganda","UA":"Ukraine","AE":"United Arab Emirates","GB":"United Kingdom","US":"United States","UM":"United States Outlying Islands","UY":"Uruguay","UZ":"Uzbekistan","VU":"Vanuatu","VE":"Venezuela","VN":"Vietnam","VG":"British Virgin Islands","VI":"U.S. Virgin Islands","WF":"Wallis and Futuna","EH":"Western Sahara","YE":"Yemen","ZM":"Zambia","ZW":"Zimbabwe"}

let supportedADM1 = ['AD', 'AE', 'AF', 'AG', 'AL', 'AM', 'AO', 'AR', 'AT', 'AU', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BN', 'BO', 'BR', 'BS', 'BT', 'BW', 'BY', 'BZ', 'CA', 'CD', 'CF', 'CG', 'CH', 'CI', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FM', 'FR', 'GA', 'GB', 'GD', 'GE', 'GH', 'GL', 'GM', 'GN', 'GQ', 'GR', 'GT', 'GW', 'GY', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IN', 'IQ', 'IR', 'IS', 'IT', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MR', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NE', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PG', 'PH', 'PK', 'PL', 'PS', 'PT', 'PW', 'PY', 'QA', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SI', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SY', 'SZ', 'TD', 'TG', 'TH', 'TJ', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'US', 'UY', 'UZ', 'VC', 'VE', 'VN', 'VU', 'WS', 'XK', 'YE', 'ZA', 'ZM', 'ZW'];
let maptapADM1 = ["US", "CN", "IN", "BR", "RU", "CA", "AU"];

let valueToCountries = {
    "usa": ["US"], "china": ["CN"], "india": ["IN"], "brazil": ["BR"], "indonesia": ["ID"], "russia": ["RU"], "canada": ["CA"],
    "japan": ["JP"], "mexico": ["MX"], "australia": ["AU"],
    "argentina": ["AR"], "pakistan": ["PK"], "egypt": ["EG"], "algeria": ["DZ"], "drc": ["CD"], "colombia": ["CO"],
    "uk": ["GB"], "france": ["FR"], "spain": ["ES"], "italy": ["IT"], "germany": ["DE"], "ukraine": ["UA"], "poland": ["PL"], "turkey": ["TR"], "iran": ["IR"],
    "peru": ["PE"], "nigeria": ["NG"], "vietnam": ["VN"], "chile": ["CL"], "iraq": ["IQ"], "venezuela": ["VE"],
    "world": ["AF", "AX", "AL", "DZ", "AS", "AD", "AO", "AI", "AQ", "AG", "AR", "AM", "AW", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BM", "BT", "BO", "BA", "BW", "BV", "BR", "IO", "BN", "BG", "BF", "BI", "KH", "CM", "CA", "CV", "KY", "CF", "TD", "CL", "CN", "CX", "CC", "CO", "KM", "CG", "CD", "CK", "CR", "CI", "HR", "CU", "CY", "CZ", "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "ET", "FK", "FO", "FJ", "FI", "FR", "GF", "PF", "TF", "GA", "GM", "GE", "DE", "GH", "GI", "GR", "GL", "GD", "GP", "GU", "GT", "GG", "GN", "GW", "GY", "HT", "HM", "VA", "HN", "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IM", "IL", "IT", "JM", "JP", "JE", "JO", "KZ", "KE", "KI", "KP", "KR", "XK", "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU", "MO", "MK", "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MQ", "MR", "MU", "YT", "MX", "FM", "MD", "MC", "MN", "ME", "MS", "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "AN", "NC", "NZ", "NI", "NE", "NG", "NU", "NF", "MP", "NO", "OM", "PK", "PW", "PS", "PA", "PG", "PY", "PE", "PH", "PN", "PL", "PT", "PR", "QA", "RE", "RO", "RU", "RW", "BL", "SH", "KN", "LC", "MF", "PM", "VC", "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SK", "SI", "SB", "SO", "ZA", "GS", "ES", "LK", "SD", "SR", "SJ", "SZ", "SE", "SS", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TK", "TO", "TT", "TN", "TR", "TM", "TC", "TV", "UG", "UA", "AE", "GB", "US", "UM", "UY", "UZ", "VU", "VE", "VN", "VG", "VI", "WF", "EH", "YE", "ZM", "ZW"],
    "africa": ["AO", "BF", "BI", "BJ", "BW", "CD", "CF", "CG", "CI", "CM", "CV", "DJ", "DZ", "EG", "EH", "ER", "ET", "GA", "GH", "GM", "GN", "GQ", "GW", "KE", "KM", "LR", "LS", "LY", "MA", "MG", "ML", "MR", "MU", "MW", "MZ", "NA", "NE", "NG", "RE", "RW", "SC", "SD", "SH", "SL", "SN", "SO", "SS", "ST", "SZ", "TD", "TG", "TN", "TZ", "UG", "YT", "ZA", "ZM", "ZW"],
    "asia": ["AF", "AM", "AZ", "BD", "BH", "BN", "BT", "CC", "CN", "CX", "CY", "GE", "HK", "ID", "IL", "IN", "IQ", "IR", "JO", "JP", "KG", "KH", "KP", "KR", "KW", "KZ", "LA", "LB", "LK", "MO", "MM", "MN", "MV", "MY", "NP", "OM", "PH", "PK", "PS", "QA", "RU", "SA", "SG", "SY", "TH", "TJ", "TL", "TM", "TR", "TW", "UZ", "VN", "YE"],
    "europe": ["AD", "AL", "AT", "AX", "BA", "BE", "BG", "BY", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FO", "FR", "GB", "GG", "GI", "GR", "HR", "HU", "IE", "IM", "IS", "IT", "JE", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SJ", "SK", "SM", "UA", "VA", "XK"],
    "n-america": ["AG", "AI", "AW", "BB", "BL", "BM", "BS", "BZ", "CA", "CR", "CU", "DM", "DO", "GD", "GL", "GP", "GT", "HN", "HT", "JM", "KN", "KY", "LC", "MF", "MQ", "MS", "MX", "NI", "PA", "PM", "PR", "SV", "TC", "TT", "US", "VC", "VG", "VI"],
    "s-america": ["AR", "BO", "BR", "CL", "CO", "EC", "FK", "GF", "GY", "PE", "PY", "SR", "UY", "VE"],
    "oceania": ["AS", "AU", "CK", "FJ", "FM", "GU", "KI", "MH", "MP", "NC", "NF", "NR", "NU", "NZ", "PF", "PG", "PN", "PW", "SB", "TK", "TO", "TV", "UM", "VU", "WF", "WS"]
};
if (localStorage.getItem("customMapArr")) {
    try {
        valueToCountries["custom"] = JSON.parse(localStorage.getItem("customMapArr"));
    } catch(e) {
        window.error(e);
        valueToCountries["custom"] = [];
    }
}

let allCountriesGeojson;
async function getAllCountriesGeojson() {
    let allCountries = await fetch("all_countries.json");
    allCountriesGeojson = await allCountries.json();
}
getAllCountriesGeojson();

d.id("left-hide-btn").listen("click", (e)=>{
    d.id("left-hide-btn").innerHTML = (d.id("left-hide-btn").innerHTML != "&lt;" ? "&lt;" : "&gt;");
    d.id("left-panel").style.display = (d.id("left-panel").style.display != "none" ? "none" : "flex");
});

function togglePanel(panelId, btnId) {
    let panel = d.id(panelId);
    if (panel.style.display == "none") {
        panel.style.display = "flex";
        d.id(btnId).classList.add("button-highlighted");
    } else {
        panel.style.display = "none";
        d.id(btnId).classList.remove("button-highlighted");
    }
}

d.id("select-map-btn").listen("click", (e)=>{
    hideCountrySelection();
    togglePanel("map-select-popup", "select-map-btn");
});

d.id("show-all-locs-btn").listen("click", (e)=>{
    if (allLocMarkers.length === 0) {
        addAllLocMarkers();
        d.id("show-all-locs-btn").classList.add("button-highlighted");
    } else {
        removeAllLocMarkers();
        d.id("show-all-locs-btn").classList.remove("button-highlighted");
    }
});

d.id("map-select-exit").listen("click", (e)=>{
    d.id("map-select-popup").style.display = "none";
    d.id("select-map-btn").classList.remove("button-highlighted");
});

d.id("show-med-countries").listen("click", (e)=>{
    if (!showMedCountries) {
        d.id("map-select-countries-med").style.display = "block";
        d.id("show-med-countries").innerText = "Hide";
    } else {
        d.id("map-select-countries-med").style.display = "none";
        d.id("show-med-countries").innerText = "More...";
    }
    showMedCountries = !showMedCountries;
})

d.id("more-settings-btn").listen("click", (e)=>{
    togglePanel("more-settings-popup", "more-settings-btn");
})

d.id("more-settings-exit").listen("click", (e)=>{
    d.id("more-settings-popup").style.display = "none";
    d.id("more-settings-btn").classList.remove("button-highlighted");
});

d.id("show-satellites-popup-btn").listen("click", (e)=>{
    togglePanel("remove-satellites-popup", "show-satellites-popup-btn");
})

d.id("remove-satellites-exit").listen("click", (e)=>{
    d.id("remove-satellites-popup").style.display = "none";
    d.id("show-satellites-popup-btn").classList.remove("button-highlighted");
});

d.id("maptap-subdivs-text").innerHTML = `(${maptapADM1.toString()})`

let tapSfx = d.id("checkbox-sfx").checked;
d.id("checkbox-sfx").listen("change", ()=>{
    tapSfx = d.id("checkbox-sfx").checked;
})

let bgSound = new Howl({src: ["sounds/bg_audio.mp3"], html5: true, loop: true, volume: 0.5});
let bgSoundId;
d.id("checkbox-bg-sound").checked = false;
d.id("checkbox-bg-sound").listen("click", ()=>{
    if (d.id("checkbox-bg-sound").checked) {
        bgSoundId = bgSound.play();
    } else {
        bgSound.stop();
    }
})

d.id("bg-sound-volume").listen("change", ()=>{
    if (bgSound.playing()) {
        bgSound.volume(parseFloat(d.id("bg-sound-volume").value), bgSoundId);
    }
})

let citiesLoaded = false;

async function loadAllCities() {
    let allCitiesResp = await fetch("all_cities_p10000.json");
    let allCitiesData = await allCitiesResp.json();
    let adm1CodeDictResp = await fetch("adm1CodeDict.json");
    let adm1CodeDict = await adm1CodeDictResp.json();

    for (let c of allCitiesData) {
        let o = {
            name: c[0],
            country: c[1],
            population: c[2],
            latitude: c[3],
            longitude: c[4],
            region_code: c[5]
        }

        allCities.push(o);

        if (Object.hasOwn(adm1CodeDict, o.country) && Object.hasOwn(adm1CodeDict[o.country], o.region_code)) {
            o.region = adm1CodeDict[o.country][o.region_code];
        } /*else {
            console.log("Subdivision name missing: " + o.name + ", " + o.country + "-" + o.region_code);
        }*/
    }

    setCurrCountries();
    citiesLoaded = true;
    setMapSource();
}
loadAllCities();

function cityFitsConstraints(c) {
    return currCountriesList.includes(c.country) && c.population >= settings.minPopulation.val && c.population <= settings.maxPopulation.val;
}

function setCurrCities(repeat=false) {
    currCitiesList = [];
    for (let c of allCities) {
        if (cityFitsConstraints(c) && !removedCities.includes(c) && !removedSatellites.includes(c)) {
            currCitiesList.push(c);
        }
    }
    d.id("num-locs").innerText = currCitiesList.length;
    if (settings.minBeforeRepeat.val > currCitiesList.length) {
        setSetting("minBeforeRepeat", currCitiesList.length);
        d.id("locs-before-repeat").value = settings.minBeforeRepeat.val.toString();
    }
    

    // If there are no cities, likely because min population is too high
    /*if (currCitiesList.length == 0 && !repeat) {
        let maxPop = 0;
        for (let c of allCities) {
            if (currCountriesList.includes(c.country) && c.population <= maxPopulation && !removedCities.includes(c)) {
                if (c.population > maxPop) {
                    maxPop = c.population;
                }
            }
        }
        minPopulation = maxPop;
        d.id("min-population").value = maxPop;
        setCurrCities(true);
    }*/
}

function addAllLocMarkers() {
    if (currCitiesList.length === 0) return;

    removeAllLocMarkers();
    allLocMarkers.length = 0;
    let maxPop = currCitiesList[0].population;
    for (let i = 1; i < currCitiesList.length; i++) {
        if (currCitiesList[i].population > maxPop) {
            maxPop = currCitiesList[i].population;
        }
    }

    let markerCities = [];
    for (let c of currCitiesList) {
        markerCities.push(c);
    }
    for (let c of [...removedCities, ...removedSatellites]) {
        if (cityFitsConstraints(c)) {
            markerCities.push(c);
        }
    }


    for (let c of markerCities) {
        if (regionColorsDict[c.region_code] === undefined) {
            let gen = true;
            let color;

            while (gen) {
                color = "#" + Math.floor(Math.random()*(2**23-1)).toString(16).padStart(6,"0");
                if (Math.max(parseInt(color[1], 16), parseInt(color[3], 16), parseInt(color[5], 16)) >= 8) {
                    gen = false;
                }
            }
            regionColorsDict[c.region_code] = color;
        }

        let markerColor = regionColorsDict[c.region_code];
        if (removedCities.includes(c)) {
            markerColor = "#aaa";
        }
        if (removedSatellites.includes(c)) {
            markerColor = "#888";
        }
        let markerScale = 2/3*Math.pow(2, 1/2*Math.log10(c.population/maxPop));

        let popup = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 25})
                    .setHTML("<span style='color:#000'>" + getCityText(c, false, true, settings.showCountry.val, true) + "</span>");
        let marker = new maplibregl.Marker({color: markerColor, scale: markerScale})
                    .setLngLat([c.longitude, c.latitude]).setPopup(popup).addTo(map);

        marker.getElement().listen("mouseenter", ()=>{if (!popup.isOpen()) marker.togglePopup()});
        marker.getElement().listen("mouseleave", ()=>{if (popup.isOpen()) marker.togglePopup()});
        allLocMarkers.push(marker);
    }
}

function removeAllLocMarkers() {
    for (let m of allLocMarkers) {
        if (m) {
            m.remove();
        }
    }
    allLocMarkers.length = 0;
}

for (let div of d.id("map-select-button-container").children) {
    for (let btn of div.children) {
        btn.listen("click", (e)=>{
            if (e.target.id !== "show-med-countries") {
                setCurrCountries(e.target.value);
                setMapSource();
            }
        });
    }
}

d.id("select-countries").listen("click", (e)=>{
    addAllCountries();
    selectingCountriesForMap = true;
    setSetting("showOutline", true);
    d.id("map-select-popup").style.display = "none";
    d.id("select-countries-panel").style.display = "block";
    d.id("show-all-locs-btn").classList.remove("button-highlighted");
    removeAllLocMarkers();
})

d.id("use-custom").listen("click", (e)=>{
    let countriesStr = d.id("custom-map-input").value;

    if (countriesStr) {
        let countriesArr = countriesStr.split(",");
        for (let i = 0; i < countriesArr.length; i++) {
            countriesArr[i] = countriesArr[i].trim().toUpperCase();
        }

        valueToCountries["custom"] = countriesArr;
    }

    setCurrCountries("custom");
    setMapSource();
});

function hideCountrySelection() {
    setMapSource();
    selectingCountriesForMap = false;
    selectedFeatureCountries.length = 0;
    d.id("selected-countries").innerText = "";
    d.id("select-countries-panel").style.display = "none";
}

d.id("select-countries-cancel").listen("click", (e)=>{
    hideCountrySelection();
    d.id("map-select-popup").style.display = "none";
    d.id("select-map-btn").classList.remove("button-highlighted");
})

d.id("select-countries-confirm").listen("click", (e)=>{
    valueToCountries["custom"] = [...selectedFeatureCountries];
    setCurrCountries("custom");
    hideCountrySelection();
    d.id("map-select-popup").style.display = "none";
    d.id("select-map-btn").classList.remove("button-highlighted");
})



d.id("load-curr-code").listen("click", (e)=>{
    let mapCode = currCountriesList.join(",");
    d.id("custom-map-input").value = mapCode;
    updateCustomMapCountryText();
});

function updateCustomMapCountryText() {
    let displayStr = "";
    let countriesStr = d.id("custom-map-input").value;

    let countriesArr = [];
    if (countriesStr) {
        countriesArr = countriesStr.split(",");
        for (let i = 0; i < countriesArr.length; i++) {
            countriesArr[i] = countriesArr[i].trim().toUpperCase();
        }
    }

    let invalidCodes = [];
    
    displayStr += "(";
    for (let i = 0; i < countriesArr.length; i++) {
        let cname = iso2ToCountryName[countriesArr[i]];
        if (cname === undefined) {
            invalidCodes.push(countriesArr[i]);
        }

        displayStr += cname;
        if (i < countriesArr.length-1) {
            displayStr += ", ";
        }
    }
    displayStr += ")";

    if (invalidCodes.length > 0) {
        displayStr = "<span style='color: #f8a'>Error - Invalid codes: "

        for (let i = 0; i < invalidCodes.length; i++) {
            displayStr += invalidCodes[i];
            if (i < invalidCodes.length-1) {
                displayStr += ", "
            } else {
                displayStr += "</span>";
            }
        } 
    }

    d.id("custom-map-countries").innerHTML = displayStr;
}
updateCustomMapCountryText();

d.id("custom-map-input").listen("change", updateCustomMapCountryText);

function setCurrMapText() {
    let mapVal = settings.countryMapVal.val;
    let currMapTxt = d.id("curr-map-val");

    if (currCountriesList.length === 1) {
        currMapTxt.innerText = iso2ToCountryName[currCountriesList[0]];
        return;
    }
    if (mapVal !== "custom") {
        currMapTxt.innerText = mapVal.replace("-", ". ").toLowerCase().replace(/\b\w/g, c=>c.toUpperCase());
        return;
    }

    if (currCountriesList.length >= 10) {
        currMapTxt.innerText = "(" + currCountriesList.length + " countries)";
    } else {
        currMapTxt.innerText = currCountriesList.join(", ");
    }
}
setCurrMapText();

function setCurrCountries(mapVal=null) {
    let prevCountriesList = currCountriesList;
    let prevCountryMap = currCountryMap;

    if (mapVal) {
        setSetting("countryMapVal", mapVal);
    }
    if (mapVal === "custom") {
        setSetting("customMapArr", JSON.stringify(valueToCountries["custom"]));
    }
    currCountryMap = settings.countryMapVal.val;

    if (valueToCountries[settings.countryMapVal.val] !== undefined) {
        currCountriesList = valueToCountries[settings.countryMapVal.val];
    }

    setCurrCities();
    locHistory = [];
    if (currCitiesList.length === 0) {
        alert("No cities match the given restrictions");
        currCountriesList = prevCountriesList;
        currCountryMap = prevCountryMap;
        setCurrCities();
    } else if (currCitiesList.length < settings.minBeforeRepeat.val) {
        minBeforeRepeat = currCitiesList.length;
        d.id("locs-before-repeat").value = currCitiesList.length;
    }

    setCurrMapText();
    selectRandCity();

    regionColorsDict = {}; // only reset colors when countries are changed
    if (allLocMarkers.length > 0) {
        addAllLocMarkers();
    }
}

d.id("min-population").listen("change", updateMapPreferences);
d.id("max-population").listen("change", updateMapPreferences);
d.id("locs-before-repeat").listen("change", updateMapPreferences);


function updateMapPreferences(e) {
    if (!citiesLoaded) return;

    let minVal = d.id("min-population").value;
    if (Number(minVal) === NaN || minVal === "") {
        alert("Invalid value for: Minimum population");
        d.id("min-population").value = settings.minPopulation.val.toString();
        return;
    }
    minVal = Number(minVal);

    let maxVal = d.id("max-population").value;
    if (Number(maxVal) === NaN || maxVal === "") {
        alert("Invalid value for: Maximum population");
        d.id("max-population").value = settings.maxPopulation.val.toString();
        return;
    }
    maxVal = Number(maxVal);

    let minBeforeRepeatVal = d.id("locs-before-repeat").value;
    if (Number(minBeforeRepeatVal) === NaN || minBeforeRepeatVal === "") {
        alert("Invalid value for: Min # of cities before repeat");
        d.id("locs-before-repeat").value = settings.minBeforeRepeat.val.toString();
        return;
    }
    minBeforeRepeatVal = Number(minBeforeRepeatVal);

    let prevMin = settings.minPopulation.val;
    setSetting("minPopulation", minVal);
    let prevMax = settings.maxPopulation.val;
    setSetting("maxPopulation", maxVal);
    let prevMinBeforeRepeat = settings.minBeforeRepeat.val;
    setSetting("minBeforeRepeat", minBeforeRepeatVal);

    setCurrCities();

    let invalid = false;

    if (currCitiesList.length == 0) {
        alert("No cities match the given restrictions");
        invalid = true;
    } else if (settings.minBeforeRepeat.val > currCitiesList.length) {
        setSetting("minBeforeRepeat", currCitiesList.length);
        d.id("locs-before-repeat").value = settings.minBeforeRepeat.val.toString();
    }

    if (invalid) {
        setSetting("minPopulation", prevMin);
        setSetting("maxPopulation", prevMax);
        setSetting("minBeforeRepeat", prevMinBeforeRepeat);
        d.id("min-population").value = prevMin.toString();
        d.id("max-population").value = prevMax.toString();
        d.id("locs-before-repeat").value = prevMinBeforeRepeat.toString();
        setCurrCities();
    }
    
    if (allLocMarkers.length > 0) {
        addAllLocMarkers();
    }
}

d.id("top-display").style.transition = "color " + settings.fadeTime.val/1000 + "s";

function selectRandCity() {
    let newCity;
    let i = 0;
    let validCity = false;

    while (!validCity) {
        newCity = currCitiesList[Math.floor(Math.random()*currCitiesList.length)];
        
        validCity = true;
        for (let i = 0; i < settings.minBeforeRepeat.val-1; i++) {
            if (locHistory[i] === newCity) {
                validCity = false;
            }
        }

        i++;
        if (i > 100) break;
    }

    locHistory.unshift(newCity);
    currCity = newCity;

    d.id("top-display").innerHTML = 
        getCityText(currCity, true, settings.showDivision.val, settings.showCountry.val, settings.showPopulation.val);
}

function getCityText(city, useHtml, showDivision, showCountry, showPopulation) {
    let displayText = city.name;

    if (showDivision && city.region && getSupportedADM1().includes(city.country)) {
        displayText += ", " + city.region;
    };
    if (showCountry && iso2ToCountryName[city.country]) {
        displayText += ", " + iso2ToCountryName[city.country];
    }
    
    if (showPopulation && city.population) {
        if (useHtml) {
            displayText += "&nbsp;<span style='font-size:13px;'>";
        } else {
            displayText += " ";
        }
        if (city.population >= 1e6) {
            displayText += "(" + Math.floor(city.population/1e5)/10 + "M)";
        } else {
            displayText += "(" + Math.floor(city.population/1e3) + "K)";
        }
        if (useHtml) {
            displayText += "</span>";
        }
    }
    return displayText;
}

let style = {
    version: 8,
    sources: {
        "satellite-tiles": {
            type: "raster",
            tiles: [getTileSource().src],
            tileSize: 256,
            attribution: "Tiles by " + getTileSource().attr
        }
    },
    layers: [{
        id: "satellite-layer",
        type: "raster",
        source: "satellite-tiles"
    }],
    projection: { type: "globe" }
}

const map = new maplibregl.Map({
    container: "map",
    style: style,
    zoom: 2,
    center: [0, 0],
    maxPitch: 85,
    canvasContextAttributes: { antialias: true },
});

map.on("error", (e)=>{
    if (e && e.error && [400].includes(e.error.status)) return;
    console.log(e);
});

function getTileSource() {
    if (d.id("checkbox-topo-map").checked) {
        return {
            "src": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
            "attr": "Esri (ArcGIS World_Shaded_Relief)"
        };
    } else if (useBlueMarbleGlobe) {
        return {
            "src": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg",
            "attr": "NASA (Blue Marble Next Generation)"
        };
    } else {
        return {
            "src": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            "attr": "Esri (ArcGIS World_Imagery)"
        };
    }
}

d.id("checkbox-topo-map").listen("change", (e)=>{
    map.getSource("satellite-tiles").setTiles([getTileSource().src]);
})

let outlineLayer = {
    "id": "polygons-stroke",
    "type": "line",
    "source": "country-polygons",
    "paint": {
        "line-color": "#A00000",
        "line-width": 1.5
    }
};

let fillLayer = {
    "id": "polygons-fill",
    "type": "fill",
    "source": "country-polygons",
    "paint": {
        "fill-color": "#ff8080",
        "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.6, 0]
    }
};

map.on("click", "polygons-fill", (e) => {
    if (!selectingCountriesForMap) return;
    let id = e.features[0].id;
    let country = e.features[0].properties["ISO3166-1-Alpha-2"];
    console.log(country)

    if (!Object.keys(iso2ToCountryName).includes(country)) return;

    if (selectedFeatureCountries.includes(country)) {
        selectedFeatureCountries = selectedFeatureCountries.filter(x => x !== country)
        map.setFeatureState({"source": "country-polygons", "id": id}, {selected: false});
    } else {
        selectedFeatureCountries.push(country);
        map.setFeatureState({"source": "country-polygons", "id": id}, {selected: true});
    }
    
    let selectedStr = "";
    for (let i = 0; i < selectedFeatureCountries.length; i++) {
        selectedStr += iso2ToCountryName[selectedFeatureCountries[i]];
        if (i < selectedFeatureCountries.length-1) {
            selectedStr += ", "
        }
    }
    d.id("selected-countries").innerText = selectedStr;
});

function getSupportedADM1() {
    return (maptapSubdivisions ? maptapADM1 : supportedADM1);
}

async function setMapSource() {
    if (map.getLayer("polygons-stroke")) {
        map.removeLayer("polygons-stroke");
    }
    if (map.getLayer("polygons-fill")) {
        map.removeLayer("polygons-fill");
    }
    if (map.getSource("country-polygons")) {
        map.removeSource("country-polygons");
    }

    let combinedFeatures = [];
    let nonADM1Countries = [];
    let countryJSONUrls = [];

    for (let country of currCountriesList) {
        if (getSupportedADM1().includes(country) && settings.outlineDivisions.val) {
            countryJSONUrls.push(`geojson_data/${country}.json`);
        } else {
            nonADM1Countries.push(country);
        }
    }

    let promises = countryJSONUrls.map(async function(url) {
        let resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`${url} - ${resp.status}`);
        }
        return resp.json();
    });
    let jsonDataObjects = await Promise.all(promises);
    for (let data of jsonDataObjects) {
        for (let f of data.features) {
            combinedFeatures.push(f);
        }
    }

    for (let f of allCountriesGeojson.features) {
        if (nonADM1Countries.includes(f.properties["ISO3166-1-Alpha-2"])) {
            combinedFeatures.push(f);
        }
    }

    map.addSource("country-polygons", {
        "type": "geojson",
        "data": {
            "type": "FeatureCollection",
            "features": combinedFeatures
        },
        "generateId": true
    });

    console.log(combinedFeatures)
    if (settings.showOutline.val) {
        map.addLayer(outlineLayer);
        map.addLayer(fillLayer);
    }
}

async function addAllCountries() {
    if (map.getLayer("polygons-stroke")) {
        map.removeLayer("polygons-stroke");
    }
    if (map.getLayer("polygons-fill")) {
        map.removeLayer("polygons-fill");
    }
    if (map.getSource("country-polygons")) {
        map.removeSource("country-polygons");
    }

    map.addSource("country-polygons", {
        "type": "geojson",
        "data": {
            "type": "FeatureCollection",
            "features": allCountriesGeojson.features
        },
        "generateId": true
    });

    if (settings.showOutline.val) {
        map.addLayer(outlineLayer);
        map.addLayer(fillLayer);
    };
}

map.on("load", (e)=> {
    map.doubleClickZoom.disable();
    map.dragRotate.disable();
});

d.id("checkbox-outline").listen("change", (e) => {
    setSettingFromEvent(e);
    addCountryOutlines();
    d.id("checkbox-outline-subdivisions").disabled = !e.currentTarget.checked;
});

d.id("checkbox-outline-subdivisions").listen("change", (e) => {
    setSettingFromEvent(e);
    setMapSource();
});

function addCountryOutlines() {
    if (!map.isStyleLoaded() || !map.getSource("country-polygons")) return;
    if (settings.showOutline.val) {
        map.addLayer(outlineLayer);
    } else {
        if (map.getLayer("polygons-stroke")) {
            map.removeLayer("polygons-stroke");
        }
    }
}

for (let id of ["checkbox-division-name", "checkbox-country-name", "checkbox-city-pop"]) {
    d.id(id).listen("change", (e)=>{
        setSettingFromEvent(e);
    })
}

d.id("checkbox-blue-marble-map").listen("change", (e)=>{
    useBlueMarbleGlobe = e.currentTarget.checked;
    map.getSource("satellite-tiles").setTiles([getTileSource().src]);
})
d.id("checkbox-maptap-subdivisions").listen("change", (e)=>{
    setSettingFromEvent(e);
    if (settings.showOutline.val && settings.outlineDivisions.val) {
        setMapSource();
    }
})


d.id("scoring-diff-slider").listen("input", (e)=>{
    setSettingFromEvent(e);
});

d.id("location-fade-slider").listen("input", (e)=>{
    setSettingFromEvent(e);
});

d.id("map").style.filter = `brightness(${settings.globeBrightness.val*100}%)`;
d.id("globe-brightness-slider").listen("input", (e)=>{
    setSettingFromEvent(e);
    d.id("map").style.filter = `brightness(${settings.globeBrightness.val*100}%)`;
});

d.id("checkbox-auto-remove").listen("change", (e)=>{
    setSettingFromEvent(e);
});
d.id("auto-remove-dist").listen("input", (e)=>{
    setSettingFromEvent(e);
});
d.id("auto-remove-num-times").listen("input", (e)=>{
    setSettingFromEvent(e);
})

let clickMarker;
let locMarker;
let opacityInterval;
let markerOpacity = 1;
let soundNames = ["full", "high", "med", "low", "lower", "lowest", "fail"];
let soundScoreReqs = [990, 950, 900, 850, 800, 700, 0];
let clickSounds = {};
for (let n of soundNames) {
    clickSounds[n] = new Howl({src: [`sounds/ding_${n}.mp3`], volume: 0.25})
}

map.on("click", (e)=> {
    if (!citiesLoaded) return;
    if (inTransition) return;
    if (selectingCountriesForMap) return;

    let pxl = map.project([e.lngLat.lng, e.lngLat.lat]);
    if (Math.pow(pxl.x - mouseX, 2) + Math.pow(pxl.y - mouseY, 2) > 4) return;
    
    inTransition = true;
    if (clickMarker) {clickMarker.remove()}
    if (locMarker) {locMarker.remove()}

    let clickedCity = currCity;

    clickMarker = new maplibregl.Marker({color: "#FF0000"}).setLngLat([e.lngLat.lng, e.lngLat.lat]).addTo(map);
    locMarker = new maplibregl.Marker({color: "#00CC00"}).setLngLat([currCity.longitude, currCity.latitude]).addTo(map);
    d.id("top-display").style.color = "rgba(255, 255, 255, 0)";

    pastMarkerCoords.push([[e.lngLat.lng, e.lngLat.lat], [currCity.longitude, currCity.latitude]]);

    let distFromClick = distanceKm(e.lngLat.lat, currCity.latitude, e.lngLat.lng, currCity.longitude);

    let scoringDiffMult = Number(d.id("scoring-diff-slider").value);
    let score = 1000*Math.exp(-(distFromClick / 16250) * (3.5*scoringDiffMult));

    if (tapSfx) {
        for (let i = 0; i < soundScoreReqs.length; i++) {
            if (score >= soundScoreReqs[i]) {
                clickSounds[soundNames[i]].play();
                break;
            }
        } 
    }

    let distPopup = d.createElement("div");
    distPopup.classList.add("dist-popup");
    distPopup.style.animation = "move-popup-text " + 1.5*settings.fadeTime.val/1000 + "s";
    distPopup.innerHTML = Math.round(score) + "/1000" + "<br>" + distFromClick.toFixed(2) + " km";
    distPopup.style.width = 200 + "px";
    distPopup.style.left = mouseX - 100 + "px";
    distPopup.style.top = mouseY - 50 + "px";
    distPopup.listen("animationend", distPopup.remove);
    distPopup.style.color = "hsl(" + (240 * (1-score/1000)) + ", 100%, 60%)";
    distPopup.style["-webkit-text-stroke"] = "0.75px hsl(" + (240 * (1-score/1000)) + ", 100%, 20%)";
    d.body.appendChild(distPopup);

    let scoreText = Math.round(score) + "/1000" + " (" + distFromClick.toFixed(2) + " km)";
    let scoreColor = "hsl(" + (240 * (1-score/1000)) + ", 100%, 85%)";

    let historyElem = addHistoryElem(scoreText, scoreColor, true);

    setMarkerInterval(true);
    setHistoryElemStyle();

    if (allLocMarkers.length > 0) {
        addAllLocMarkers();
    }

    let key = allCities.indexOf(clickedCity);
    if (!settings.autoRemove.val) return;
    if (distFromClick < settings.autoRemoveDist.val) {
        if (Object.hasOwn(numTimesGuessedCorrect, key)) {
            numTimesGuessedCorrect[key]++;
        } else {
            numTimesGuessedCorrect[key] = 1;
        }

        let numCorrectToRemove = settings.autoRemoveTimes.val;
        if (numTimesGuessedCorrect[key] >= numCorrectToRemove) {
            removeLatestCity();
        }
    } else {
        if (Object.hasOwn(numTimesGuessedCorrect, key)) {
            numTimesGuessedCorrect[key] = 0;
        }
    }
})

function addHistoryElem(scoreText, scoreColor, addClickMarker) {
    let historyElem = d.createElement("div");
    historyElem.classList.add("history-elem");
    let locationNameElem = d.createElement("div");
    locationNameElem.innerHTML = d.id("top-display").innerHTML;
    historyElem.appendChild(locationNameElem);
    let secondRow = d.createElement("div");
    let scoreElem = d.createElement("span");
    scoreElem.innerText = scoreText;
    scoreElem.style.color = scoreColor;
    secondRow.appendChild(scoreElem);
    historyElem.appendChild(secondRow);
    historyElem.setAttribute("data-marker-ind", pastMarkerCoords.length-1);

    historyElem.listen("mouseenter", (e)=>{
        let markerPositions = pastMarkerCoords[e.currentTarget.getAttribute("data-marker-ind")];

        if (addClickMarker) {
            showingClickMarker = new maplibregl.Marker({color: "#800000"}).setLngLat(markerPositions[0]).addTo(map);
        }
        showingLocMarker = new maplibregl.Marker({color: "#008000"}).setLngLat(markerPositions[1]).addTo(map);
    });

    historyElem.listen("mouseleave", (e)=>{
        if (addClickMarker) {
            if (showingClickMarker) {showingClickMarker.remove();}
        }
        if (showingLocMarker) {showingLocMarker.remove();}
    });

    d.id("loc-history").prepend(historyElem);
    if (d.id("loc-history").children.length > 50) {
        d.id("loc-history").removeChild(d.id("loc-history").lastElementChild);
    }

    return historyElem;
}

function setMarkerInterval(addClickMarker) {
    if (autoStart) {
        opacityInterval = setInterval(() => {
            markerOpacity = Math.max(0, markerOpacity-1/(settings.fadeTime.val/20));
            if (addClickMarker) {
                clickMarker.setOpacity(Math.pow(markerOpacity, 2), Math.pow(markerOpacity, 2)/5);
            }
            locMarker.setOpacity(Math.pow(markerOpacity, 2), Math.pow(markerOpacity, 2)/5);
        })

        setTimeout(() => {
            selectRandCity();
            d.id("top-display").style.color = "rgba(255, 255, 255, 1)";
            clearInterval(opacityInterval);
            markerOpacity = 1;

            if (addClickMarker) {
                clickMarker.setOpacity(0, 0);
            }
            locMarker.setOpacity(0, 0);

            inTransition = false;
        }, settings.fadeTime.val);
    }
}

function setHistoryElemStyle() {
    let historyElems = d.id("loc-history").children;
    for (let i = 0; i < historyElems.length; i++) {
        if (i !== 0) {
            historyElems[i].style.backgroundColor = "rgba(177, 0, 0, 0.4)";
        } else {
            historyElems[i].style.backgroundColor = "rgba(255, 90, 90, 0.4)";
        }

        if ([...removedCities, ...removedSatellites].includes(locHistory[i])) {
            historyElems[i].style.color = "#d2acac";
        } else {
            historyElems[i].style.color = "#ffffff";
        }
    };
}

d.listen("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
})

function createTopRightPopup(color, text, border=null){
    let popup = d.createElement("div");
    popup.style.position = "fixed";
    popup.style.top = "0";
    popup.style.right = "0";
    popup.style.color = color;
    popup.innerText = text;
    if (border) {
        popup.style["text-shadow"] = `-1px -1px 0 ${border}, 1px -1px 0 ${border}, -1px 1px 0 ${border}, 1px 1px 0 ${border}`;
    }
    popup.style.transition = "opacity 2.5s";
    popup.listen("transitionend", popup.remove);
    d.body.appendChild(popup);
    setTimeout(()=>{popup.style.opacity = "0"}, 30);
}

function removeSatellites(pop_mult, max_distance_km, max_pop=1e8, need_same_subdiv=false) {
    // pop_mult - How many times bigger parent city needs to be for satellite/suburb to be removed
    // max_pop - Max population for city to be removed
    
    let prevRemovedNum = removedSatellites.length;
    removedSatellites.length = 0;
    citiesInCountry = allCities.filter(x => currCountriesList.includes(x.country));
    citiesInCountry.sort((a, b) => a.population-b.population);

    for (let c1 of citiesInCountry) {
        for (let c2 of citiesInCountry) { // c2 = city to remove
            if (c2.population > c1.population/pop_mult || c2.population >= max_pop) break;
            if (!removedSatellites.includes(c2) && (!need_same_subdiv || c1.region === c2.region) &&
                distanceKm(c1.latitude, c2.latitude, c1.longitude, c2.longitude) < max_distance_km) {
                removedSatellites.push(c2);
            }
        }
    }
    let newRemovedNum = removedSatellites.length;
    d.id("num-removed-satellites-text").innerText = removedSatellites.length + "";

    setCurrCities();
    if (newRemovedNum >= prevRemovedNum) {
        createTopRightPopup("#ffcfcf", "Removed " + (newRemovedNum-prevRemovedNum) + " satellites/suburbs from cities list", "#000");
    } else {
        createTopRightPopup("#cfcfff", "Restored " + (prevRemovedNum-newRemovedNum) + " satellites/suburbs to cities list", "#000");
    }

    if (allLocMarkers.length > 0) {
        addAllLocMarkers();
    }
}

d.id("remove-satellites").listen("click", (e)=>{
    let popMult = parseInt(d.id("satellite-pop-mult").value);
    let maxDist = parseInt(d.id("satellite-max-dist").value);
    let maxPop = parseInt(d.id("satellite-max-pop").value);
    let requireSameSubdiv = d.id("require-same-subdiv").checked;
    removeSatellites(popMult, maxDist, maxPop, requireSameSubdiv);
})

d.id("restore-satellites").listen("click", (e)=>{
    removeSatellites(1, 0, 0);
})

function removeLatestCity() {
    if (currCitiesList.length == 1) {
        alert("Can't delete the only city remaining. Maybe decrease min. population?");
        return;
    }
    let cityToRemove = inTransition ? locHistory[0] : locHistory[1];
    removedCities.push(cityToRemove);
    setCurrCities();
    createTopRightPopup("#ffcfcf", "Removed " + cityToRemove.name + " from cities list", "#000");
    if (allLocMarkers.length > 0) {
        addAllLocMarkers();
    }
}

function restoreRemovedCities() {
    let prevCitiesLen = currCitiesList.length;
    removedCities = [];
    setCurrCities();
    let newCitiesLen = currCitiesList.length;
    createTopRightPopup("#cfcfff", "Restored " + (newCitiesLen-prevCitiesLen) + " removed cities to cities list", "#000");
}

d.listen("keydown", (e) => {
    if (d.activeElement && d.activeElement.tagName === "INPUT") return;

    if (e.key === "r") {
        removeLatestCity();
    } else if (e.key === "b") {
        restoreRemovedCities();
    } else if (e.key === " ") {
        if (inTransition) return;

        inTransition = true;
        if (clickMarker) {clickMarker.remove()}
        if (locMarker) {locMarker.remove()}

        pastMarkerCoords.push([[null, null], [currCity.longitude, currCity.latitude]]);
        locMarker = new maplibregl.Marker({color: "#00CC00"}).setLngLat([currCity.longitude, currCity.latitude]).addTo(map);
        d.id("top-display").style.color = "rgba(255, 255, 255, 0)";

        let historyElem = addHistoryElem("Didn't know", "#cad", false);

        setMarkerInterval(false);
        setHistoryElemStyle();
    }
});

// Haversine formula https://www.geeksforgeeks.org/dsa/program-distance-two-points-earth/
function distanceKm(lat1, lat2, lon1, lon2) {
    lon1 = lon1 * Math.PI / 180;
    lon2 = lon2 * Math.PI / 180;
    lat1 = lat1 * Math.PI / 180;
    lat2 = lat2 * Math.PI / 180;

    let dlon = lon2 - lon1; 
    let dlat = lat2 - lat1;
    let a = Math.pow(Math.sin(dlat / 2), 2)
            + Math.cos(lat1) * Math.cos(lat2)
            * Math.pow(Math.sin(dlon / 2),2);
        
    let c = 2 * Math.asin(Math.sqrt(a));
    let r = 6371;

    return c * r;
}