// Data used: https://public.opendatasoft.com/explore/assets/geonames-all-cities-with-a-population-1000/view
import { registerSentinelMercatorProtocol } from './sentinel-mercator-protocol.js';
registerSentinelMercatorProtocol(maplibregl);

let d = document;
d.id = d.getElementById;

EventTarget.prototype.listen = function(t, f) {
    this.addEventListener(t, f);
};

let mouseX = 0;
let mouseY = 0;
let autoStart = true;
let allCities = [];
let allCitiesMaptap = [];
let currCitiesList = [];
let currCity;
let inTransition = false;
let currCountriesList = [];
let currCountryMap = "";
let removedCities = [];
let deepRemovedCities = []; // Deep removed cities can't be restored with R
let removedSatellites = []; // Removed satellites can't be removed with keys at all (prevents having to click again)
let locHistory = [];
let pastMarkerCoords = [];
let showingClickMarker;
let showingLocMarker;
let allLocMarkers = [];
let regionColorsDict = {};
let showMedCountries = false;
let selectedFeatureCountries = [];
let selectingCountriesForMap = false;
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
    "showPopulation": {"val": true, "id": "checkbox-city-pop", "type": "b"},
    "showDifficulty": {"val": true, "id": "checkbox-city-diff", "type": "b"},
    "showOutline": {"val": true, "id": "checkbox-outline", "type": "b"},
    "outlineDivisions": {"val": true, "id": "checkbox-outline-subdivisions", "type": "b"},
    "maptapSubdivisions": {"val": false, "id": "checkbox-maptap-subdivisions", "type": "b"},
    "minPopulation": {"val": 100000, "id": "min-population", "type": "n"},
    "maxPopulation": {"val": 50000000, "id": "max-population", "type": "n"},
    "minBeforeRepeat": {"val": 10, "id": "locs-before-repeat", "type": "n"},
    "customMapArr": {"val": [], "id": null, "type": "o"},
    "countryMapVal": {"val": "china", "id": null, "type": "s"},
    "globeTileType": {"val": "maptap", "id": "map-style-select", "type": "s"},
    "useMaptapDatabase": {"val": false, "id": "checkbox-maptap-database", "type": "b"},
    "minDiff": {"val": 1, "id": "min-difficulty", "type": "n"},
    "maxDiff": {"val": 6, "id": "max-difficulty", "type": "n"},
    "mapCenterLat": {"val": 0, "id": null, "type": "n"},
    "mapCenterLng": {"val": 0, "id": null, "type": "n"},
    "maptapCitiesOnly": {"val": true, "id": "checkbox-cities-only", "type": "b"},
    "dotMarkers": {"val": false, "id": "checkbox-dot-markers", "type": "b"},
    "clickMarkerScale": {"val": 1, "id": "marker-scale-slider", "type": "n", "textId": "marker-scale-value"}
}

let mapPrefs = [
    {id: "min-population", setting: "minPopulation", name: "Minimum population"},
    {id: "max-population", setting: "maxPopulation", name: "Maximum population"},
    {id: "locs-before-repeat", setting: "minBeforeRepeat", name: "Min # of cities before repeat"},
    {id: "min-difficulty", setting: "minDiff", name: "Min. location difficulty"},
    {id: "max-difficulty", setting: "maxDiff", name: "Max. location difficulty"}
]

for (let k in settings) {
    let stg = settings[k];

    let item = localStorage.getItem(k);
    if (item !== null && item !== "") {
        stg.val = convertToType[stg.type](item);
    } else {
        let setVal = (typeof stg.val) === "string" ? stg.val : JSON.stringify(stg.val);
        localStorage.setItem(k, setVal);
    }

    if (stg.id) {
        let elem = d.id(stg.id);
        if (!elem) {
            localStorage.removeItem(k);
            delete settings[k];
            continue;
        }

        if (elem.type === "checkbox") {
            elem.checked = stg.val;
        } else {
            elem.value = stg.val;
        }
        
        if (!mapPrefs.map(x=>x.setting).includes(k)) {
            elem.listen((elem.type === "checkbox" || elem.tagName === "SELECT") ? "change" : "input", (e) => {
                //console.log(stg.id);
                setSettingFromEvent(e);
                //console.log(`Value: ${stg.val}`);
            });
        }
    }

    if (Object.hasOwn(stg, "textId")) {
        d.id(stg.textId).innerText = stg.val;
    }
}

function setSetting(k, v) {
    let stg = settings[k];
    localStorage.setItem(k, v);
    stg.val = convertToType[stg.type](v);

    if (Object.hasOwn(stg, "textId")) {
        d.id(stg.textId).innerText = stg.val;
    }
}


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

let inputtedMinBeforeRepeat = settings.minBeforeRepeat.val;
let iso2ToCountryName = {"AF":"Afghanistan","AX":"Aland Islands","AL":"Albania","DZ":"Algeria","AS":"American Samoa","AD":"Andorra","AO":"Angola","AI":"Anguilla","AQ":"Antarctica","AG":"Antigua and Barbuda","AR":"Argentina","AM":"Armenia","AW":"Aruba","AU":"Australia","AT":"Austria","AZ":"Azerbaijan","BS":"Bahamas","BH":"Bahrain","BD":"Bangladesh","BB":"Barbados","BY":"Belarus","BE":"Belgium","BZ":"Belize","BJ":"Benin","BM":"Bermuda","BT":"Bhutan","BO":"Bolivia","BA":"Bosnia and Herzegovina","BW":"Botswana","BV":"Bouvet Island","BR":"Brazil","IO":"British Indian Ocean Territory","BN":"Brunei","BG":"Bulgaria","BF":"Burkina Faso","BI":"Burundi","KH":"Cambodia","CM":"Cameroon","CA":"Canada","CV":"Cape Verde","KY":"Cayman Islands","CF":"Central African Republic","TD":"Chad","CL":"Chile","CN":"China","CX":"Christmas Island","CC":"Cocos (Keeling) Islands","CO":"Colombia","KM":"Comoros","CG":"Rep. of the Congo","CD":"Dem. Rep. of the Congo","CK":"Cook Islands","CR":"Costa Rica","CI":"Côte d'Ivoire","HR":"Croatia","CU":"Cuba","CY":"Cyprus","CZ":"Czech Republic","DK":"Denmark","DJ":"Djibouti","DM":"Dominica","DO":"Dominican Republic","EC":"Ecuador","EG":"Egypt","SV":"El Salvador","GQ":"Equatorial Guinea","ER":"Eritrea","EE":"Estonia","ET":"Ethiopia","FK":"Falkland Islands (Malvinas)","FO":"Faroe Islands","FJ":"Fiji","FI":"Finland","FR":"France","GF":"French Guiana","PF":"French Polynesia","TF":"French Southern Territories","GA":"Gabon","GM":"The Gambia","GE":"Georgia","DE":"Germany","GH":"Ghana","GI":"Gibraltar","GR":"Greece","GL":"Greenland","GD":"Grenada","GP":"Guadeloupe","GU":"Guam","GT":"Guatemala","GG":"Guernsey","GN":"Guinea","GW":"Guinea-Bissau","GY":"Guyana","HT":"Haiti","HM":"Heard Island and McDonald Islands","VA":"Vatican City","HN":"Honduras","HK":"Hong Kong","HU":"Hungary","IS":"Iceland","IN":"India","ID":"Indonesia","IR":"Iran","IQ":"Iraq","IE":"Ireland","IM":"Isle of Man","IL":"Israel","IT":"Italy","JM":"Jamaica","JP":"Japan","JE":"Jersey","JO":"Jordan","KZ":"Kazakhstan","KE":"Kenya","KI":"Kiribati","KP":"North Korea","KR":"South Korea","XK":"Kosovo","KW":"Kuwait","KG":"Kyrgyzstan","LA":"Laos","LV":"Latvia","LB":"Lebanon","LS":"Lesotho","LR":"Liberia","LY":"Libya","LI":"Liechtenstein","LT":"Lithuania","LU":"Luxembourg","MO":"Macao","MK":"North Macedonia","MG":"Madagascar","MW":"Malawi","MY":"Malaysia","MV":"Maldives","ML":"Mali","MT":"Malta","MH":"Marshall Islands","MQ":"Martinique","MR":"Mauritania","MU":"Mauritius","YT":"Mayotte","MX":"Mexico","FM":"Micronesia","MD":"Moldova","MC":"Monaco","MN":"Mongolia","ME":"Montenegro","MS":"Montserrat","MA":"Morocco","MZ":"Mozambique","MM":"Myanmar","NA":"Namibia","NR":"Nauru","NP":"Nepal","NL":"Netherlands","AN":"Netherlands Antilles","NC":"New Caledonia","NZ":"New Zealand","NI":"Nicaragua","NE":"Niger","NG":"Nigeria","NU":"Niue","NF":"Norfolk Island","MP":"Northern Mariana Islands","NO":"Norway","OM":"Oman","PK":"Pakistan","PW":"Palau","PS":"Palestine","PA":"Panama","PG":"Papua New Guinea","PY":"Paraguay","PE":"Peru","PH":"Philippines","PN":"Pitcairn","PL":"Poland","PT":"Portugal","PR":"Puerto Rico","QA":"Qatar","RE":"Reunion","RO":"Romania","RU":"Russia","RW":"Rwanda","BL":"Saint Barthelemy","SH":"Saint Helena","KN":"Saint Kitts and Nevis","LC":"Saint Lucia","MF":"Saint Martin","PM":"Saint Pierre and Miquelon","VC":"Saint Vincent and the Grenadines","WS":"Samoa","SM":"San Marino","ST":"Sao Tome and Principe","SA":"Saudi Arabia","SN":"Senegal","RS":"Serbia","SC":"Seychelles","SL":"Sierra Leone","SG":"Singapore","SK":"Slovakia","SI":"Slovenia","SB":"Solomon Islands","SO":"Somalia","ZA":"South Africa","GS":"South Georgia and the South Sandwich Islands","ES":"Spain","LK":"Sri Lanka","SD":"Sudan","SR":"Suriname","SJ":"Svalbard and Jan Mayen","SZ":"Eswatini","SE":"Sweden","SS":"South Sudan","CH":"Switzerland","SY":"Syria","TW":"Taiwan","TJ":"Tajikistan","TZ":"Tanzania","TH":"Thailand","TL":"Timor-Leste","TG":"Togo","TK":"Tokelau","TO":"Tonga","TT":"Trinidad and Tobago","TN":"Tunisia","TR":"Turkey","TM":"Turkmenistan","TC":"Turks and Caicos Islands","TV":"Tuvalu","UG":"Uganda","UA":"Ukraine","AE":"United Arab Emirates","GB":"United Kingdom","US":"United States","UM":"United States Outlying Islands","UY":"Uruguay","UZ":"Uzbekistan","VU":"Vanuatu","VE":"Venezuela","VN":"Vietnam","VG":"British Virgin Islands","VI":"U.S. Virgin Islands","WF":"Wallis and Futuna","EH":"Western Sahara","YE":"Yemen","ZM":"Zambia","ZW":"Zimbabwe"}

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
    "oceania": ["AS", "AU", "CK", "FJ", "FM", "GU", "KI", "MH", "MP", "NC", "NF", "NR", "NU", "NZ", "PF", "PG", "PN", "PW", "SB", "TK", "TO", "TV", "UM", "VU", "WF", "WS"],
    "oceania-islands": ["AS", "CK", "FJ", "FM", "GU", "KI", "MH", "MP", "NC", "NF", "NR", "NU", "PF", "PN", "PW", "SB", "TK", "TO", "TV", "UM", "VU", "WF", "WS"],
    "caribbean-islands": ["VI", "AI", "MF", "KN", "LC", "AG", "DM", "VC", "BB", "GD", "TT", "VG", "MQ", "MS"]
};
if (localStorage.getItem("customMapArr")) {
    try {
        valueToCountries["custom"] = JSON.parse(localStorage.getItem("customMapArr"));
    } catch(e) {
        window.error(e);
        valueToCountries["custom"] = [];
    }
}

d.id("left-hide-btn").listen("click", (e)=>{
    d.id("left-hide-btn").innerHTML = (d.id("left-hide-btn").innerHTML != "&lt;" ? "&lt;" : "&gt;");
    d.id("left-panel").style.display = (d.id("left-panel").style.display != "none" ? "none" : "flex");
});

function toggleMenuPopup(panelId, btnId) {
    let panel = d.id(panelId);
    if (panel.style.display == "none") {
        panel.style.display = "flex";
        d.id(btnId).classList.add("button-highlighted");
    } else {
        panel.style.display = "none";
        d.id(btnId).classList.remove("button-highlighted");
    }
}

function isMenuPopupOpen() {
    let menuPopupOpen = false;
    for (let elem of d.getElementsByClassName("center-popup")) {
        if (elem.style.display != "none") {
            menuPopupOpen = true;
        }
    }
    return menuPopupOpen;
}

d.id("select-map-btn").listen("click", (e)=>{
    hideCountrySelection();
    toggleMenuPopup("map-select-popup", "select-map-btn");
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

function changeSettingVis() {
    if (d.id("checkbox-maptap-database").checked) {
        for (let el of d.getElementsByClassName("regular-db-settings")) {
            el.style.display = "none";
        }
        for (let el of d.getElementsByClassName("maptap-db-settings")) {
            el.style.display = "flex";
        }
    } else {
        for (let el of d.getElementsByClassName("regular-db-settings")) {
            el.style.display = "flex";
        }
        for (let el of d.getElementsByClassName("maptap-db-settings")) {
            el.style.display = "none";
        }
    }
}
changeSettingVis();


d.id("checkbox-maptap-database").listen("change", (e)=>{
    changeSettingVis();
    setCurrCities();
    if (allLocMarkers.length > 0) {
        addAllLocMarkers();
    }
})

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
    toggleMenuPopup("more-settings-popup", "more-settings-btn");
})

d.id("more-settings-exit").listen("click", (e)=>{
    d.id("more-settings-popup").style.display = "none";
    d.id("more-settings-btn").classList.remove("button-highlighted");
});

d.id("show-satellites-popup-btn").listen("click", (e)=>{
    toggleMenuPopup("remove-satellites-popup", "show-satellites-popup-btn");
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
d.id("checkbox-bg-sound").listen("change", ()=>{
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

let allCountriesGeojson;
async function loadAllCities() {
    let resps = await Promise.all(["all_cities_p10000.json", "all_locs_maptap.json", "adm1CodeDict.json", "all_countries.json"].map(x=>fetch(x)));
    let [allCitiesData, allCitiesMaptapData, adm1CodeDict, allCountriesGeojsonTemp] = await Promise.all(resps.map(x=>x.json()));

    allCountriesGeojson = allCountriesGeojsonTemp;

    for (let c of allCitiesData) {
        let o = {
            name: c[0],
            country: c[1],
            population: c[2],
            latitude: c[3],
            longitude: c[4],
            region_code: c[5],
            maptap_loc: false
        }

        allCities.push(o);

        if (Object.hasOwn(adm1CodeDict, o.country) && Object.hasOwn(adm1CodeDict[o.country], o.region_code)) {
            o.region = adm1CodeDict[o.country][o.region_code];
        }
        delete o.region_code;
    }

    for (let c of allCitiesMaptapData) {
        let o = {
            name: c[0],
            country: c[1],
            latitude: c[2],
            longitude: c[3],
            region: c[4],
            type: c[5],
            difficulty: c[6],
            population: c[7],
            maptap_loc: true
        }

        allCitiesMaptap.push(o);
    }

    setCurrCountries();
    citiesLoaded = true;
    setMapSource();
}
loadAllCities();

function getCityId(c) {
    return c.maptap_loc ? (allCitiesMaptap.indexOf(c) + "M") : (allCities.indexOf(c) + "R")
}

function isCity(maptapLoc) {
    return ["city", "capital", "state_capital"].includes(maptapLoc.type)
}

function cityFitsConstraints(c) {
    if (c.maptap_loc) {
        return currCountriesList.includes(c.country) && c.difficulty >= settings.minDiff.val && c.difficulty <= settings.maxDiff.val && !(settings.maptapCitiesOnly.val && !isCity(c));
    } else {
        return currCountriesList.includes(c.country) && c.population >= settings.minPopulation.val && c.population <= settings.maxPopulation.val;
    }
}

function setCurrCities() {
    let list = settings.useMaptapDatabase.val ? allCitiesMaptap : allCities;

    currCitiesList = [];
    for (let c of list) {
        if (cityFitsConstraints(c) && !removedCities.includes(c) && !removedSatellites.includes(c)) {
            currCitiesList.push(c);
        }
    }
    d.id("num-locs").innerText = currCitiesList.length;
    if (settings.minBeforeRepeat.val > currCitiesList.length) {
        setSetting("minBeforeRepeat", currCitiesList.length);
        d.id("locs-before-repeat").value = settings.minBeforeRepeat.val.toString();
    }
    if (settings.minBeforeRepeat.val < inputtedMinBeforeRepeat && currCitiesList.length > settings.minBeforeRepeat.val) {
        setSetting("minBeforeRepeat", Math.min(inputtedMinBeforeRepeat, currCitiesList.length));
        d.id("locs-before-repeat").value = settings.minBeforeRepeat.val.toString();
    }
}

let maptapDiffColors = [
    "#00cc88", "#33cc00", "#88cc00", "#cccc00", "#cc7700", "#cc4400", "#cc0077", "#cc00cc"
];

function addAllLocMarkers() {
    if (currCitiesList.length === 0) return;

    removeAllLocMarkers();
    allLocMarkers.length = 0;
    let maxPop = 1;
    for (let c of [...currCitiesList, ...removedCities]) {
        if (cityFitsConstraints(c) && c.population > maxPop) {
            maxPop = c.population;
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
        let markerColor;

        if (!settings.useMaptapDatabase.val) {
            if (regionColorsDict[c.region] === undefined) {
                let numGens = 0;
                let gen = true;
                let color;

                while (gen && numGens < 100) {
                    color = "#" + Math.floor(Math.random()*(2**24-1)).toString(16).padStart(6,"0");
                    let brightness = Math.max(parseInt(color[1]+color[2], 16), parseInt(color[3]+color[4], 16), parseInt(color[5]+color[6], 16));
                    if (brightness >= 8*16 && brightness <= 14*16) {
                        gen = false;
                    }
                    numGens++;
                }
                regionColorsDict[c.region] = color;
            }

            markerColor = regionColorsDict[c.region];
        } else {
            markerColor = maptapDiffColors[c.difficulty-1];
        }


        if (removedCities.includes(c)) {
            markerColor = "#aaa";
        }
        if (removedSatellites.includes(c)) {
            markerColor = "#888";
        }
        let markerScale;
        
        if (c.maptap_loc) {
            markerScale = (c.population && isCity(c)) ? 0.55*Math.pow(2, 0.36*Math.log10(c.population/maxPop)) : 0.36;
        } else {
            markerScale = 0.67*Math.pow(2, 0.5*Math.log10(c.population/maxPop));
        }

        let popup = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: settings.dotMarkers.val ? 10 : 25})
                    .setHTML("<span style='color:#000'>" + getCityText(c, false, true, settings.showCountry.val, true, true) + "</span>");
        let marker = createMarker(markerColor, markerScale, c.longitude, c.latitude).setPopup(popup);

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
    setTimeout(addAllCountries, 100);
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

function finishCountrySelect() {
    d.id("map-select-popup").style.display = "none";
    d.id("select-map-btn").classList.remove("button-highlighted");
    setSetting("showOutline", d.id("checkbox-outline").checked);
}

d.id("select-countries-cancel").listen("click", (e)=>{
    hideCountrySelection();
    finishCountrySelect();
})

d.id("select-countries-confirm").listen("click", (e)=>{
    valueToCountries["custom"] = [...selectedFeatureCountries];
    setCurrCountries("custom");
    hideCountrySelection();
    finishCountrySelect();
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
        currMapTxt.innerText = mapVal.replace("-", " ").toLowerCase().replace(/\b\w/g, c=>c.toUpperCase());
        return;
    }

    let sortedCountries = currCountriesList.toSorted();
    if (sortedCountries.length > 4) {
        currMapTxt.innerText = sortedCountries.slice(0, 3).join(", ") + ", (+" + (sortedCountries.length-3) + ")";
    } else {
        currMapTxt.innerText = sortedCountries.join(", ");
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
    }

    setCurrMapText();
    selectRandCity();

    regionColorsDict = {}; // only reset colors when countries are changed
    if (allLocMarkers.length > 0) {
        addAllLocMarkers();
    }
}

for (let pref of mapPrefs) {
    d.id(pref.id).listen("change", updateMapPreferences);
}

function updateMapPreferences(e) {
    if (!citiesLoaded) return;

    for (let pref of mapPrefs) {
        let val = d.id(pref.id).value;
        if (Number(val) === NaN || val === "") {
            alert(`Invalid value for: ${pref.name}`);
            d.id(pref.id).value = settings[pref.setting].val.toString();
            return;
        }
        pref.val = Number(val);
    }

    for (let pref of mapPrefs) {
        pref.prev = settings[pref.setting].val;
        setSetting(pref.setting, pref.val);

        if (pref.setting == "minBeforeRepeat" && pref.prev != settings.minBeforeRepeat.val) {
            inputtedMinBeforeRepeat = settings.minBeforeRepeat.val;
        }
    }

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
        for (let pref of mapPrefs) {
            setSetting(pref.setting, pref.prev);
            d.id(pref.id).value = pref.prev.toString();
        }
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
        getCityText(currCity, true, settings.showDivision.val, settings.showCountry.val, settings.showPopulation.val, settings.showDifficulty.val);
}

function getCityText(city, useHtml, showDivision, showCountry, showPopulation, showDifficulty) {
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
    if (showDifficulty && city.difficulty) {
        if (useHtml) {
            displayText += "&nbsp;<span style='font-size:13px;'>";
        } else {
            displayText += " ";
        }
        displayText += "(L" + city.difficulty + ")";
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
            tiles: [getTileSource()],
            tileSize: 256,
        }
    },
    layers: [{
        id: "satellite-layer",
        type: "raster",
        source: "satellite-tiles",
    }],
    maxTileCacheZoomLevels: 8,
    projection: { type: "globe" }
}

let map = new maplibregl.Map({
    container: "map",
    style: style,
    zoom: 2,
    center: [0, 0],
    maxPitch: 85,
    canvasContextAttributes: { antialias: true },
});
map.setCenter([settings.mapCenterLng.val, settings.mapCenterLat.val]);

function getTileSource() {
    if (settings.globeTileType.val === "topo") {
        return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}";
    } else if (settings.globeTileType.val === "maptap") {
        return "sentinel-merc://{z}/{x}/{y}";
    } else if (settings.globeTileType.val === "blue-marble") {
        return "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
    } else {
        return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    }
}

d.id("map-style-select").listen("change", (e)=>{
    map.getSource("satellite-tiles").setTiles([getTileSource()]);
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
    //console.log(country)

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

setInterval(() => {
    if (map.getCenter().lat != settings.mapCenterLat.val) {
        setSetting("mapCenterLat", map.getCenter().lat);
    }
    if (map.getCenter().lng != settings.mapCenterLng.val) {
        setSetting("mapCenterLng", map.getCenter().lng);
    }
}, 2000);

function getSupportedADM1() {
    return (settings.maptapSubdivisions.val ? maptapADM1 : supportedADM1);
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

    if (!map.getSource("country-polygons")) {
        map.addSource("country-polygons", {
            "type": "geojson",
            "data": {
                "type": "FeatureCollection",
                "features": combinedFeatures
            },
            "generateId": true
        });
    }

    //console.log(combinedFeatures)
    if (settings.showOutline.val) {
        if (!map.getLayer("polygons-stroke")) {
            map.addLayer(outlineLayer);
        }
        if (!map.getLayer("polygons-fill")) {
            map.addLayer(fillLayer);
        }
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
        if (!map.getLayer("polygons-stroke")) {
            map.addLayer(outlineLayer);
        }
        if (!map.getLayer("polygons-fill")) {
            map.addLayer(fillLayer);
        }
    };
}

map.on("load", (e)=> {
    map.doubleClickZoom.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
});

d.id("checkbox-outline-subdivisions-container").style.display = d.id("checkbox-outline").checked ? "block" : "none";
d.id("checkbox-outline").listen("change", (e) => {
    addCountryOutlines();
    d.id("checkbox-outline-subdivisions-container").style.display = e.currentTarget.checked ? "block" : "none";
});

d.id("checkbox-outline-subdivisions").listen("change", (e) => {
    setMapSource();
});

function addCountryOutlines() {
    if (!map.isStyleLoaded() || !map.getSource("country-polygons")) return;
    if (settings.showOutline.val) {
        if (!map.getLayer("polygons-stroke")) {
            map.addLayer(outlineLayer);
        }
    } else {
        if (map.getLayer("polygons-stroke")) {
            map.removeLayer("polygons-stroke");
        }
    }
}

d.id("checkbox-cities-only").listen("change", (e)=>{
    setCurrCities();
    if (allLocMarkers.length > 0) {
        addAllLocMarkers();
    }
})

d.id("checkbox-maptap-subdivisions").listen("change", (e)=>{
    if (settings.showOutline.val && settings.outlineDivisions.val) {
        setMapSource();
    }
})

d.id("map").style.filter = `brightness(${settings.globeBrightness.val*100}%)`;
d.id("globe-brightness-slider").listen("input", (e)=>{
    d.id("map").style.filter = `brightness(${settings.globeBrightness.val*100}%)`;
});

function createMarker(col, scl, lng, lat) {
    let marker;
    if (!settings.dotMarkers.val) {
        marker = new maplibregl.Marker({"color": col, "scale": scl});
    } else {
        let dot = document.createElement("div");
        dot.className = "dot-marker";
        dot.style.backgroundColor = col;
        dot.style.width = 20*scl + "px";
        dot.style.height = 20*scl + "px";
        marker = new maplibregl.Marker({"element": dot});
    }
    marker.setLngLat([lng, lat]).addTo(map);
    return marker;
}

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
    if (!citiesLoaded) {//console.log("Click failed: cities not loaded");
        return;}
    if (inTransition) {//console.log("Click failed: in transition");
        return;}
    if (selectingCountriesForMap) {//console.log("Click failed: selecting countries");
        return;}

    let pxl = map.project([e.lngLat.lng, e.lngLat.lat]);
    let cdist = (pxl.x - mouseX)**2 + (pxl.y - mouseY)**2;
    if (cdist > 4) {//console.log(`Click failed: off map - pxl: ${pxl.x},${pxl.y} mouse: ${mouseX},${mouseY}`);
        return;}
    
    //console.log("Clicked");
    inTransition = true;
    if (clickMarker) {clickMarker.remove()}
    if (locMarker) {locMarker.remove()}

    let clickedCity = currCity;
    
    locMarker = createMarker("#00CC00", settings.clickMarkerScale.val, currCity.longitude, currCity.latitude);
    clickMarker = createMarker("#FF0000", settings.clickMarkerScale.val, e.lngLat.lng, e.lngLat.lat);

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
    distPopup.style["user-select"] = "none";
    d.body.appendChild(distPopup);

    let scoreText = Math.round(score) + "/1000" + " (" + distFromClick.toFixed(2) + " km)";
    let scoreColor = "hsl(" + (240 * (1-score/1000)) + ", 100%, 85%)";

    let historyElem = addHistoryElem(clickedCity, scoreText, scoreColor, true);

    setMarkerInterval(true);
    setHistoryElemStyle();

    if (allLocMarkers.length > 0) {
        addAllLocMarkers();
    }

    let key = getCityId(clickedCity);
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

function addHistoryElem(city, scoreText, scoreColor, addClickMarker) {
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

    /*let linkButton = d.createElement("button");
    linkButton.listen("click", ()=>{
        window.open(`https://www.google.com/maps/place/${getCityText(city, false, true, true, false, false).replaceAll(" ", "+")}`, "_blank", "noopener,noreferrer")
    })
    linkButton.classList.add("button-link");
    linkButton.innerText = "→";
    linkButton.title = "Open location in Google Maps"
    historyElem.appendChild(linkButton);*/

    historyElem.listen("mouseenter", (e)=>{
        let markerPositions = pastMarkerCoords[e.currentTarget.getAttribute("data-marker-ind")];

        showingLocMarker = createMarker("#008000", settings.clickMarkerScale.val, markerPositions[1][0], markerPositions[1][1]);
        if (addClickMarker) {
            showingClickMarker = createMarker("#800000", settings.clickMarkerScale.val, markerPositions[0][0], markerPositions[0][1]);
        }
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

d.listen("click", (e) => {
    if (event.target.tagName === "BUTTON") {
        if (isMenuPopupOpen()) {
            d.id("map").style.filter = `brightness(50%)`;
        } else {
            d.id("map").style.filter = `brightness(${settings.globeBrightness.val*100}%)`;
        }
    }
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
    if (settings.useMaptapDatabase.val) {
        createTopRightPopup("#ffcfcf", "Doesn't work with MapTap database, for now", "#000");
        return;
    }
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
    for (let c of removedCities) {
        let id = getCityId(c);
        if (Object.hasOwn(numTimesGuessedCorrect, id)) {
            numTimesGuessedCorrect[id] = 0;
        }
    }

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
        locMarker = createMarker("#00CC00", settings.clickMarkerScale.val, currCity.longitude, currCity.latitude);
        d.id("top-display").style.color = "rgba(255, 255, 255, 0)";

        let historyElem = addHistoryElem(currCity, "Didn't know", "#cad", false);

        setMarkerInterval(false);
        setHistoryElemStyle();
    }
});

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