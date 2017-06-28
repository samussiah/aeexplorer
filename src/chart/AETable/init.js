/*------------------------------------------------------------------------------------------------\
  Call functions to collapse the raw data using the selected categories and create the summary
  table.
\------------------------------------------------------------------------------------------------*/

import { showCellCounts } from './showCellCounts';
import { util } from '../util';

export function init(chart) {
    //convinience mappings
    var vars = chart.config.variables;

    //Get current chart type ("participant" or "event")
    var summary = d3.selectAll('.summaryDiv label').filter(function(d) {
        return d3.select(this).selectAll('.summaryRadio').property('checked');
    })[0][0].textContent;

    /////////////////////////////////////////////////////////////////
    // Prepare the data for charting
    /////////////////////////////////////////////////////////////////

    //Create a dataset nested by [ chart.config.variables.group ] and [ chart.config.variables.id ].
    var dataAny = util.cross(
        chart.population_event_data,
        chart.config.groups,
        vars['id'],
        'All',
        'All',
        vars['group'],
        chart.config.groups
    );

    //Create a dataset nested by [ chart.config.variables.major ], [ chart.config.variables.group ], and
    //[ chart.config.variables.id ].
    var dataMajor = util.cross(
        chart.population_event_data,
        chart.config.groups,
        vars['id'],
        vars['major'],
        'All',
        vars['group'],
        chart.config.groups
    );

    //Create a dataset nested by [ chart.config.variables.major ], [ chart.config.variables.minor ],
    //[ chart.config.variables.group ], and [ chart.config.variables.id ].
    var dataMinor = util.cross(
        chart.population_event_data,
        chart.config.groups,
        vars['id'],
        vars['major'],
        vars['minor'],
        vars['group'],
        chart.config.groups
    );

    //Add a 'differences' object to each row.
    dataMajor = util.addDifferences(dataMajor, chart.config.groups);
    dataMinor = util.addDifferences(dataMinor, chart.config.groups);
    dataAny = util.addDifferences(dataAny, chart.config.groups);

    //Sort the data based by maximum prevelence.
    dataMajor = dataMajor.sort(util.sort.maxPer);
    dataMinor.forEach(function(major) {
        major.values.sort(function(a, b) {
            var max_a = d3.max(
                a.values.map(function(groups) {
                    return groups.values.per;
                })
            );
            var max_b = d3.max(
                b.values.map(function(groups) {
                    return groups.values.per;
                })
            );

            return max_a < max_b ? 1 : -1;
        });
    });

    /////////////////////////////////////////////////////////////////
    // Allow the user to download a csv of the current view
    /////////////////////////////////////////////////////////////////

    //Output the data if the validation setting is flagged.
    if (chart.config.validation && d3.select('#downloadCSV')[0][0] === null) {
        var majorValidation = chart.util.collapse(dataMajor);
        var minorValidation = chart.util.collapse(dataMinor);

        var fullValidation = d3
            .merge([majorValidation, minorValidation])
            .sort(function(a, b) {
                return a.minorCategory < b.minorCategory ? -1 : 1;
            })
            .sort(function(a, b) {
                return a.majorCategory < b.majorCategory ? -1 : 1;
            });

        var CSV = chart.util.json2csv(fullValidation);

        chart.wrap
            .append('a')
            .attr({
                href: 'data:text/csv;charset=utf-8,' + escape(CSV),
                download: true,
                id: 'downloadCSV'
            })
            .text('Download Summarized Data');
    }

    /////////////////////////////////////
    // Draw the summary table headers.
    /////////////////////////////////////
    //Check to make sure there is some data
    if (!dataMajor.length) {
        chart.wrap
            .select('.SummaryTable')
            .append('div')
            .attr('class', 'alert')
            .text('Error: No data matches the current filters. Update the filters to see results.');
        throw new Error('No data found in the column specified for major category. ');
    }

    var tab = chart.wrap.select('.SummaryTable').append('table');
    var nGroups = chart.config.groups.length + chart.config.defaults.totalCol;
    var header1 = tab.append('thead').append('tr');

    //Expand/collapse control column header
    header1.append('th').attr('rowspan', 2);

    //Category column header
    header1.append('th').attr('rowspan', 2).text('Category');

    //Group column headers
    header1.append('th').attr('colspan', nGroups - chart.config.defaults.totalCol).text('Groups');

    //Total column header
    if (chart.config.defaults.totalCol) header1.append('th').text('');

    //Graphical AE rates column header
    header1.append('th').text('AE Rate by group');

    //Group differences column header
    var header2 = tab.select('thead').append('tr');
    header2
        .selectAll('td.values')
        .data(
            chart.config.defaults.totalCol
                ? chart.config.groups.concat({
                      key: 'Total',
                      n: d3.sum(chart.config.groups, d => d.n),
                      nEvents: d3.sum(chart.config.groups, d => d.nEvents)
                  })
                : chart.config.groups
        )
        .enter()
        .append('th')
        .html(
            d =>
                '<span>' +
                d.key +
                '</span>' +
                '<br><span id="group-num">(n=' +
                (summary === 'participant' ? d.n : d.nEvents) +
                ')</span>'
        )
        .style('color', d => chart.colorScale(d.key))
        .attr('class', 'values');
    header2.append('th').attr('class', 'prevHeader');
    if (nGroups > 1 && chart.config.defaults.diffCol) {
        header1.append('th').text('Difference Between Groups').attr('class', 'diffplot');
        header2.append('th').attr('class', 'diffplot axis');
    }

    //Prevalence scales
    var allPercents = d3.merge(
        dataMajor.map(function(major) {
            return d3.merge(
                major.values.map(function(minor) {
                    return d3.merge(
                        minor.values.map(function(group) {
                            return [group.values.per];
                        })
                    );
                })
            );
        })
    );
    chart.percentScale = d3.scale
        .linear()
        .range([0, chart.config.plotSettings.w])
        .domain([0, d3.max(allPercents)]);

    //Add Prevalence Axis
    var percentAxis = d3.svg.axis().scale(chart.percentScale).orient('top').ticks(6);

    var prevAxis = chart.wrap
        .select('th.prevHeader')
        .append('svg')
        .attr('height', '34px')
        .attr('width', chart.config.plotSettings.w + 10)
        .append('svg:g')
        .attr('transform', 'translate(5,34)')
        .attr('class', 'axis percent')
        .call(percentAxis);

    //Difference Scale
    if (chart.config.groups.length > 1) {
        //Difference Scale
        var allDiffs = d3.merge(
            dataMajor.map(function(major) {
                return d3.merge(
                    major.values.map(function(minor) {
                        return d3.merge(
                            minor.differences.map(function(diff) {
                                return [diff.upper, diff.lower];
                            })
                        );
                    })
                );
            })
        );

        var minorDiffs = d3.merge(
            dataMinor.map(function(m) {
                return d3.merge(
                    m.values.map(function(m2) {
                        return d3.merge(
                            m2.differences.map(function(m3) {
                                return d3.merge([[m3.upper], [m3.lower]]);
                            })
                        );
                    })
                );
            })
        );

        chart.diffScale = d3.scale
            .linear()
            .range([
                chart.config.plotSettings.diffMargin.left,
                chart.config.plotSettings.w - chart.config.plotSettings.diffMargin.right
            ])
            .domain(d3.extent(d3.merge([minorDiffs, allDiffs])));

        //Difference Axis
        var diffAxis = d3.svg.axis().scale(chart.diffScale).orient('top').ticks(8);

        var prevAxis = chart.wrap
            .select('th.diffplot.axis')
            .append('svg')
            .attr('height', '34px')
            .attr('width', chart.config.plotSettings.w + 10)
            .append('svg:g')
            .attr('transform', 'translate(5,34)')
            .attr('class', 'axis')
            .attr('class', 'percent')
            .call(diffAxis);
    }

    ////////////////////////////
    // Add Rows to the table //
    ////////////////////////////

    //Append a group of rows (<tbody>) for each major category.
    var majorGroups = tab
        .selectAll('tbody')
        .data(dataMajor, function(d) {
            return d.key;
        })
        .enter()
        .append('tbody')
        .attr('class', 'minorHidden')
        .attr('class', function(d) {
            return 'major-' + d.key.replace(/[^A-Za-z0-9]/g, '');
        });

    //Append a row summarizing all minor categories for each major category.
    var majorRows = majorGroups
        .selectAll('tr')
        .data(
            function(d) {
                return d.values;
            },
            function(datum) {
                return datum.key;
            }
        )
        .enter()
        .append('tr')
        .attr('class', 'major')
        .each(function(d) {
            var thisRow = d3.select(this);
            chart.util.fillRow(thisRow, chart, d);
        });

    //Append rows for each minor category.
    var majorGroups = tab.selectAll('tbody').data(dataMinor, function(d) {
        return d.key;
    });

    var minorRows = majorGroups
        .selectAll('tr')
        .data(
            function(d) {
                return d.values;
            },
            function(datum) {
                return datum.key;
            }
        )
        .enter()
        .append('tr')
        .attr('class', 'minor')
        .each(function(d) {
            var thisRow = d3.select(this);
            chart.util.fillRow(thisRow, chart, d);
        });
    //Add a footer for overall rates.
    tab
        .append('tfoot')
        .selectAll('tr')
        .data(dataAny.length > 0 ? dataAny[0].values : [])
        .enter()
        .append('tr')
        .each(function(d) {
            var thisRow = d3.select(this);
            chart.util.fillRow(thisRow, chart, d);
        });

    //Remove unwanted elements from the footer.
    tab.selectAll('tfoot svg').remove();
    tab.select('tfoot i').remove();
    tab.select('tfoot td.controls span').text('');

    //////////////////////////////////////////////////
    // Initialize event listeners for summary Table //
    //////////////////////////////////////////////////

    // Show cell counts on Mouseover/Mouseout of difference diamonds
    chart.wrap
        .selectAll('td.diffplot svg g path.diamond')
        .on('mouseover', function(d) {
            var currentRow = chart.wrap.selectAll('.SummaryTable tbody tr').filter(function(e) {
                return e.values[0].values.major === d.major && e.values[0].values.minor === d.minor;
            });

            //Display CI;
            d3.select(this.parentNode).select('.ci').classed('hidden', false);

            //show cell counts for selected groups
            showCellCounts(chart, currentRow, d.group1);
            showCellCounts(chart, currentRow, d.group2);
        })
        .on('mouseout', function(d) {
            d3.select(this.parentNode).select('.ci').classed('hidden', true); //hide CI
            chart.wrap.selectAll('.annote').remove(); //Delete annotations.
        });

    // Highlight rows on mouseover
    chart.wrap
        .selectAll('.SummaryTable tr')
        .on('mouseover', function(d) {
            d3.select(this).select('td.rowLabel').classed('highlight', true);
        })
        .on('mouseout', function(d) {
            d3.select(this).select('td.rowLabel').classed('highlight', false);
        });

    //Expand/collapse a section
    chart.wrap.selectAll('tr.major').selectAll('td.controls').on('click', function(d) {
        var current = d3.select(this.parentNode.parentNode);
        var toggle = !current.classed('minorHidden');
        current.classed('minorHidden', toggle);

        d3
            .select(this)
            .select('span')
            .attr('title', toggle ? 'Expand' : 'Collapse')
            .text(function() {
                return toggle ? '+' : '-';
            });
    });

    // Render the details table
    chart.wrap.selectAll('td.rowLabel').on('click', function(d) {
        //Update classes (row visibility handeled via css)
        var toggle = !chart.wrap.select('.SummaryTable table').classed('summary');
        chart.wrap.select('.SummaryTable table').classed('summary', toggle);
        chart.wrap.select('div.controls').selectAll('div').classed('hidden', toggle);

        //Create/remove the participant level table
        if (toggle) {
            var major = d.values[0].values['major'];
            var minor = d.values[0].values['minor'];
            var detailTableSettings = { major: major, minor: minor };
            chart.detailTable.init(chart, detailTableSettings);
        } else {
            chart.wrap.select('.DetailTable').remove();
            chart.wrap.select('div.closeDetailTable').remove();
        }
    });
}
