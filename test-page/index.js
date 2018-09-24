//If in local environment...
document.onreadystatechange = function () {
  if (document.readyState === 'complete') {

if (window.origin !== 'https://rhoinc.github.io') {

    var head = document.getElementsByTagName('head')[0];

  //...load local build.
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = '../build/aeTable.js';
    head.appendChild(script);

  //...load local stylesheet.
    for (var i = 0; i < document.styleSheets.length; i++) {
        var styleSheet = document.styleSheets[i];
        if (styleSheet.href.indexOf('aeTable') > -1)
            styleSheet.disabled = true;
    }
    var link = document.createElement('link');
    link.type = 'text/css';
    link.rel = 'stylesheet';
    link.href = '../css/aeTable.css';
    head.appendChild(link);
}

d3.csv(
    'https://rawgit.com/RhoInc/viz-library/master/data/safetyData/ADAE.csv',
    function(error,data) {
        if (error)
            console.log(error);

        var settings = {
         variableOptions:{
           group:["RACE","SEX"]
         },
         defaults:{
           webchartsDetailTable:true
         }
        };
        var instance = aeTable.createChart(
            '#container',
            settings
        );
        instance.init(data);
    }
);
}
}