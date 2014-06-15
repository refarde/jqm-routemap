( function ( $, window ) {
	var document = window.document,
		svgNameSpace = "http://www.w3.org/2000/svg",
		regId = /\bui-id-([\w\-]+)\b/,
		regAttr = /([a-z])([A-Z])/g;

	$.widget( "mobile.routemap", $.mobile.widget, {
		options: {
			language: null,
			db: null,
			unit: 1,
			pathType: "standard",
			initSelector: ":jqmData(role='routemap')"
		},

		_svg: null,
		_languageData: null,
		_lines: [],
		_stations: [],
		_nameList: {},
		_graph: {},
		_data: {},
		_intersectCache: undefined,

		_create: function () {
			var self = this,
				view = self.element,
				routemapContainer = $( 
					"<div class='ui-routemap-container'>" +
						"<div class='ui-legend'></div>" +
						"<div class='ui-station-container'></div>" +
					"</div>" )
					.appendTo( view );

			self._svg = $( document.createElementNS( svgNameSpace, "svg" ) )
				.attr( {
					"version": "1.1",
					"width": "100%",
					"height": "100%",
					"class": "ui-line-container"
				} ).appendTo( routemapContainer )[0];

			view.addClass( "ui-routemap" );

			$.each( this.options, function ( key, value ) {
				self._setOption( key, value );
			} );

			if ( document.readyState === "complete" ) {
				self.refresh( true );
			}

			routemapContainer.on( "vclick", function ( event ) {
				var target = $( event.target ),
					targetId;

				if ( target[0].namespaceURI.indexOf("svg") > -1 ){
					if ( self._hasClass( target, "ui-line" ) ) {
						targetId = regId.exec( target.attr( "class" ) );
					}
				} else if ( target.hasClass( "ui-shape" ) || target.hasClass( "ui-label" ) ) {
					targetId = regId.exec( target.parent().attr( "class" ) );
				}

				target.trigger( "select", targetId ? targetId[1] : undefined );

				event.stopPropagation();
			} );
		},

		_setOption: function ( key, value ) {
			var self = this,
				option = self.options,
				data;
			$.Widget.prototype._setOption.apply( this, arguments );

			switch ( key ) {
			case "db":
				if ( typeof value === "string" && value.match( /\.(json)$/i ) ) {
					$.ajax( {
						async: false,
						global: false,
						dataType: "JSON",
						url : option.db
					} ).done( function ( result ) {
						data = result;
					} ).fail( function ( e ) {
						throw new Error( e );
					} );
				} else if ( typeof value === "object" ) {
					data = value;
				}
				if ( data ) {
					if ( self._svg.firstChild ) {
						self._refreshData( data );
					} else {
						self._processData( data );
					}
					self._data = data;
				}
				break;

			case "unit":
				if ( self._svg.firstChild ) {
					self._refreshData( self._data );
				}
				break;

			case "language":
				if ( !value ) {
					this._languageData = null;
					return;
				}

				data = option.db;

				if ( !data || !data.match(/\.(json)$/i) ) {
					return;
				}

				data = data.substring( data.lastIndexOf("\\") + 1, data.lastIndexOf(".") ) +
						"." + value + "." + data.substring( data.lastIndexOf(".") + 1, data.length );

				$.ajax( {
					async: false,
					global: false,
					dataType: "JSON",
					url : data
				} ).done( function ( result ) {
					self._languageData = result;
				} );
				break;
			}
		},

		_refreshData: function ( data ) {
			this._lines= [];
			this._stations= [];
			this._nameList= {};
			this._graph= {};
			this._processData( data );
			this.refresh( true );
		},

		_clear: function () {
			while ( this._svg.firstChild ) {
				this._svg.removeChild( this._svg.firstChild );
			}
			$( ".ui-station-container" ).empty();
		},

		_processData: function ( data ) {
			var i, j, k,
				lines = data.lines,
				lineLength = lines.length,
				branches,
				branchesLength,
				stations,
				stationsLength,
				station,
				exchange,
				stationStyle,
				exchangeStyle = data.exchangeStyle || {},
				lineStyle,
				coord,
				linePath,
				stationsMap = [],
				graph = {};

			for ( i = 0; i < lineLength; i++ ) {
				branches = lines[i].branches;
				branchesLength = branches.length;
				stationStyle = lines[i].style.station || {};
				lineStyle = lines[i].style.line || {};
				this._nameList[ lines[i].id ] = lines[i].name;

				for ( j = 0; j < branchesLength; j++ ) {
					stations = branches[j];
					stationsLength = stations.length;
					linePath = "";
					previousPosition = { x: -1, y: -1 };

					for ( k = 0; k < stationsLength; k++ ) {
						station = stations[k];
						coord = station.coordinates;

						if ( graph[station.id] === undefined ) {
							graph[station.id] = {};
						}

						if ( stations[k - 1] !== undefined ) {
							graph[station.id][stations[k - 1].id] = 3;
						}

						if ( stations[k + 1] !== undefined ) {
							graph[station.id][stations[k + 1].id] = 3;
						}

						//stations
						if ( !stationsMap[coord[0]] ) {
							stationsMap[coord[0]] = [];
						}

						this._nameList[ station.id ] = station.label;

						if ( !stationsMap[coord[0]][coord[1]] ) {
							station.style = stationStyle;
							station.transfer = [];
							stationsMap[coord[0]][coord[1]] = station;
							this._stations.push( station );
						} else {
							exchange = stationsMap[coord[0]][coord[1]];

							if ( !exchange.transfer.length ) {
								exchange.style = exchangeStyle;
							}

							exchange.transfer.push( station.id );
							graph[station.id][exchange.id] = "TRANSPER";
							graph[exchange.id][station.id] = "TRANSPER";
						}

						// lines
						linePath += this._pathMananger( this.options.pathType, stations, k );
					}
					this._lines.push( { path: linePath, style: lineStyle, id: lines[i].id } );
				}
			}
			this._graph = graph;
		},

		_setupDrawingRange: function () {
			var i,
				label,
				labelTranslateX = 0.5,
				labelTranslateY = 1,
				stationName,
				labelPosition,
				unit = this.options.unit,
				stations = this._stations,
				stationLength = stations.length,
				stationWidth = this.element.find( ".ui-exchange .ui-shape" ).eq(0).outerWidth();
				minX = 9999,
				minY = 9999,
				maxX = 0,
				maxY = 0,
				fontSize = parseInt( this.element.css( "fontSize" ), 10 ),
				routemapContainer = this.element.find( ".ui-routemap-container" );

			for ( i = 0; i < stationLength; i += 1 ) {
				station = stations[i];
				label = station.label,
				stationName = this._languageData ? ( this._languageData[label] || label ) : label;
				labelPosition = station.labelPosition || "s";

				if ( /s/.test( labelPosition ) ) {
					labelTranslateY = 3;
				} else if ( /n/.test( labelPosition ) ) {
					labelTranslateY = -2;
				}

				if ( /w/.test( labelPosition ) ) {
					labelTranslateX = -1;
				} else if ( /e/.test( labelPosition ) ) {
					labelTranslateX = 1;
				}

				x = station.coordinates[0] * unit + stationWidth + fontSize +
					( stationName ? stationName.length : 0 ) * fontSize * labelTranslateX;
				y = station.coordinates[1] * unit + fontSize * labelTranslateY + stationWidth;

				minX = ( minX > x ) ? x : minX;
				minY = ( minY > y ) ? y : minY;
				maxX = ( maxX < x ) ? x : maxX;
				maxY = ( maxY < y ) ? y : maxY;
			}

			routemapContainer.width( maxX ).height( maxY );
		},

		_pathMananger: function ( type, stations, index ) {
			var unit = this.options.unit,
				coordinateToPosition = function ( station ) {
					var coordinates = station.coordinates;
					return { label: station.label, x: unit * coordinates[0], y: unit * coordinates[1] };
				},
				previous, current, next, afterNext;

			current = coordinateToPosition( stations[index] );

			if ( index < 1 ) {
				return "M" + current.x + "," + current.y;
			}

			if ( index > stations.length - 2 ) {
				return "L" + current.x + "," + current.y;
			}

			previous = coordinateToPosition( stations[index - 1] );
			next = coordinateToPosition( stations[( index > stations.length - 2 ) ? index : ( index + 1 )] );
			beforePrevious = this._intersectCache || coordinateToPosition( stations[( index < 2 ) ? ( ( index < 1 ) ? 0 : index - 1 ) : ( index - 2 )] );

			this._intersectCache = undefined;

			return this["_" + type + "Path"]( current, previous, next, beforePrevious );
		},

		_simplePath: function ( current ) {
			return "L" + current.x + "," + current.y;
		},

		_smoothPath: function ( current, previous, next ) {
			// Catmull-Rom to Cubic Bezier conversion matrix
			//    0       1       0       0
			//  -1/6      1      1/6      0
			//    0      1/6      1     -1/6
			//    0       0       1       0
			var control = {
				x: ( previous.x + 6 * current.x - next.x ) / 6,
				y: ( previous.y + 6 * current.y - next.y ) / 6
			};

			return "S" + " " + control.x + "," + control.y + " " + current.x + "," + current.y;
		},

		_stiffPath: function ( current, previous, next, beforePrevious ) {
			var vector1 = { x: previous.x - beforePrevious.x, y: previous.y - beforePrevious.y },
				vector2 = { x: current.x - previous.x, y: current.y - previous.y },
				vector3 = { x: next.x - current.x, y: next.y - current.y },
				angle1 = this._calculateArc( vector1, vector2 ),
				angle2 = this._calculateArc( vector2, vector3 ), 
				control1, control2, intersect, path = "";

			if ( Math.abs( angle1 ) < 5 || Math.abs( angle2 ) < 5 || this._isParallel( angle1, angle2 ) ) {
				return "L" + current.x + "," + current.y;
			} else {
				control1 = { x: 2 * previous.x - beforePrevious.x, y: 2 * previous.y - beforePrevious.y };
				control2 = { x: 2 * current.x - next.x, y: 2 * current.y - next.y };
				intersect = this._getIntersect( previous.x, previous.y, control1.x, control1.y, current.x, current.y, control2.x, control2.y );

				if ( !isNaN( intersect.x ) && !isNaN( intersect.y ) && this._validateDrawingRange( intersect ) ) {
					this._intersectCache = intersect;
					path += "L" + intersect.x + "," + intersect.y;
				}

				path += "L" + current.x + "," + current.y

				return path;
			}
		},

		_standardPath: function ( current, previous, next, beforePrevious ) {
			var vector1 = { x: previous.x - beforePrevious.x, y: previous.y - beforePrevious.y },
				vector2 = { x: current.x - previous.x, y: current.y - previous.y },
				vector3 = { x: next.x - current.x, y: next.y - current.y },
				angle1 = this._calculateArc( vector1, vector2 ),
				angle2 = this._calculateArc( vector2, vector3 ), 
				control1, control2, middle1, middle2, intersect, path = "";

			if ( Math.abs( angle1 ) < 5 || Math.abs( angle2 ) < 5 || this._isParallel( angle1, angle2 ) ) {
				return "L" + current.x + "," + current.y;
			} else {
				control1 = { x: 2 * previous.x - beforePrevious.x, y: 2 * previous.y - beforePrevious.y };
				control2 = { x: 2 * current.x - next.x, y: 2 * current.y - next.y };
				intersect = this._getIntersect( previous.x, previous.y, control1.x, control1.y, current.x, current.y, control2.x, control2.y );
				middle1 = { x: ( intersect.x + previous.x ) / 2, y: ( intersect.y + previous.y ) / 2 };
				middle2 = { x: ( intersect.x + current.x ) / 2, y: ( intersect.y + current.y ) / 2 };

				if ( !isNaN( intersect.x ) && !isNaN( intersect.y ) && this._validateDrawingRange( intersect ) ) {
					this._intersectCache = intersect;
					path += "L" + middle1.x + "," + middle1.y +
						"C" + intersect.x + "," + intersect.y + " " + intersect.x + "," + intersect.y + " " + middle2.x + "," + middle2.y;
				}

				path += "L" + current.x + "," + current.y

				return path;
			}
		},

		_convertAngle: function ( angle ) {
			return ( angle < 0 ) ? 360 + angle : angle;
		},

		_isParallel: function ( angle1, angle2 ) {
			return Math.abs( this._convertAngle( angle1 ) - this._convertAngle( angle2 ) ) > 100;
		},

		_getIntersect: function ( x1, y1, x2, y2, x3, y3, x4, y4 ) {
			return {
				x:	( ( x1 * y2 - y1 * x2 ) * ( x3 - x4 ) - ( x1 - x2 ) * ( x3 * y4 - y3 * x4 ) ) /
					( ( x1 - x2 ) * ( y3 - y4 ) - ( y1 - y2 ) * ( x3 - x4 ) ),
				y:	( ( x1 * y2 - y1 * x2 ) * ( y3 - y4 ) - ( y1 - y2 ) * ( x3 * y4 - y3 * x4 ) ) /
					( ( x1 - x2 ) * ( y3 - y4 ) - ( y1 - y2 ) * ( x3 - x4 ) )
			};
		},

		_validateDrawingRange: function ( point ) {
			return ( point.x >= 0 && point.y >= 0 );
		},

		_calculateArc: function ( line1, line2 ) {
			var normalize = function( a ) {
					var len = a.x * a.x + a.y * a.y;
					if ( len > 0 ) {
						len = 1 / Math.sqrt( len );
						return { x: a.x * len, y: a.y * len };
					}
					return { x: 0, y: 0 };
				},
				dot = function ( a, b ) {
					return a.x * b.x + a.y * b.y;
				};

			line1 = normalize( line1 );
			line2 = normalize( line2 );

			inner = dot( line1, line2 );
			result = Math.acos( inner ) * 180 / Math.PI;

			if ( isNaN( result ) ) {
				return 0;
			}

			return ( line1.x * line2.y - line1.y * line2.x >= 0 ) ? result : -result;
		},

		// -------------------------------------------------
		// Drawing

		_drawLines: function () {
			var i, lines = this._lines,
				length = lines.length;

			for ( i = 0; i < length; i += 1 ) {
				this._node( null, "path", {
					"class": "ui-line ui-id-" + lines[i].id,
					d: lines[i].path
				}, lines[i].style );
			}
		},

		_drawLegend: function () {
			var i, lines = this._lines,
				length = lines.length,
				namelist = this._nameList,
				tags = "",
				lineId = "";

			for ( i = 0; i < length; i +=1 ) {
				if ( lineId !== lines[i].id ) {
					lineId = lines[i].id;

					tags +=
						"<div class='ui-line ui-id-" + lineId + "'>" +
							"<div class='ui-shape' style='border-color:" + ( lines[i].style.stroke || gray ) + "'></div>" +
							"<div class='ui-label'>" + namelist[ lineId ] + "</div>" +
						"</div>";
				}
			}

			$( ".ui-legend", this.element ).append( tags );
		},

		_drawStations: function () {
			var i,
				options = this.options,
				unit = options.unit,
				stationRadius,
				stations = this._stations,
				stationLength = stations.length,
				station,
				coordinates,
				classes,
				$stationContainer = this.element.find( ".ui-station-container" ),
				position,
				stationTags = "";

			for ( i = 0; i < stationLength; i += 1 ) {
				station = stations[i];
				coordinates = station.coordinates;
				classes = "ui-station ui-id-" + station.id;
				position = [ unit * coordinates[0], unit * coordinates[1] ];
				circleStyles = "";

				if ( station.transfer.length ) {
					classes += " ui-id-" + station.transfer.join( " ui-id-" ) + " ui-exchange";
				}

				circleStyles += 
					"top:" + position[1] + "px;" +
					"left:" + position[0] + "px;";

				stationTags += "<div class='" + classes + "'>" +
					"<div class='ui-shape' style='" + circleStyles + "'></div>" +
					this._getStationLabelTag( i, station, position ) +
					"</div>";
			}

			$stationContainer.append( stationTags );
		},

		_getStationLabelTag: function ( i, station, position ) {
			var label = station.label,
				classes = "",
				labelTranslate = 0,
				labelAngle = station.labelAngle ? -parseInt( station.labelAngle, 10 ) : 0;
				stationName = this._languageData ? ( this._languageData[label] || label ) : label,
				labelPosition = station.labelPosition || "s";

			if ( !stationName ) {
				return "";
			}

			if ( stationName.match( /<br/g ) ) {
				classes += " ui-multi-line"; 
			}

			classes += " ui-" + labelPosition;

			switch ( labelPosition ) {
				case "w" :
				case "nw" :
				case "sw" :
					labelTranslate = -100;
					break;
				case "s" :
				case "n" :
					labelTranslate = -50;
					break;
			}

			return "<span class='ui-label" + classes + "' style='" +
						"top:" + position[1] + "px;" +
						"left:" + position[0] + "px;" +
						"-webkit-transform:" + "translateX( " + labelTranslate + "% ) rotate( " + labelAngle + "deg );" +
					"'>" + stationName + "</span>";
		},

		// -------------------------------------------------
		// SVG

		_node: function ( parent, name, settings, style ) {
			var node, key, value, string = "";

			parent = parent || this._svg;
			node = parent.ownerDocument.createElementNS( svgNameSpace, name );
			settings = settings || {};

			for ( key in settings ) {
				value = settings[key];
				if ( value && ( typeof value !== "string" || value !== "" ) ) {
					node.setAttribute( key.replace( regAttr, "$1-$2" ).toLowerCase(), value);
				}
			}

			if ( style ) {
				for ( key in style ) {
					value = style[key];
					if ( value && ( typeof value !== "string" || value !== "" ) ) {
						string += key.replace( regAttr, "$1-$2" ).toLowerCase() + ":" + value + ";";
					}
				}
				node.setAttribute( "style", string );
			}

			parent.appendChild( node );
			return node;
		},

		_hasClass: function ( elements, className ) {
			return new RegExp( "\\b" + className + "\\b" ).test( elements.attr( "class" ) );
		},

		_addClass: function ( elements, className ) {
			var element, classAttr;
			$.each( elements, function () {
				element = $( this );
				if ( element[0].namespaceURI.indexOf( "svg" ) === -1 ) {
					element.addClass( className );
					return true;
				}
				classAttr = element.attr( "class" );
				if ( classAttr.indexOf( className ) !== -1 ) {
					return true;
				}
				element.attr( "class", classAttr + " " + className );
			} );
		},

		_removeClass: function ( elements, className ) {
			var element, classAttr;

			$.each( elements, function () {
				element = $( this );
				if ( element[0].namespaceURI.indexOf( "svg" ) === -1 ) {
					element.removeClass( className );
					return true;
				}
				classAttr = element.attr( "class" );
				element.attr( "class", classAttr.replace( new RegExp( "\\s?" + className ), "" ) );
			} );
		},

		// -------------------------------------------------
		// Dijkstra path-finding functions
		// Original code: https://bitbucket.org/wyatt/dijkstra.js(MIT license)
		// Thanks Wyatt Baldwin
		_calculateShortestPath: function ( graph, source, destination, isMinimumTransfersMode ) {
			var predecessors, costs, open,
				closest,
				u, v,
				costU,
				adjacentNodes,
				costE,
				costUTotal,
				costV,
				msg,
				destCost,
				nodes = [];

			function PriorityQueue() {
				var queue = [],
					sorter = function ( a, b ) {
						return a.cost - b.cost;
					};

				this.push = function ( value, cost ) {
					var item = { value: value, cost: cost };

					queue.push( item );
					queue.sort( sorter );
				};

				this.pop = function () {
					return queue.shift();
				};

				this.empty = function () {
					return queue.length === 0;
				};
			}

			predecessors = {};

			costs = {};
			costs[source] = 0;

			open = new PriorityQueue();
			open.push( source, 0 );

			while ( !open.empty() ) {
				closest = open.pop();
				u = closest.value;
				costU = closest.cost;

				adjacentNodes = graph[u] || {};

				for ( v in adjacentNodes ) {
					costE = adjacentNodes[v];

					if ( costE === "TRANSPER" ) {
						costE = isMinimumTransfersMode ? 999 : 3;
					}

					costUTotal = costU + costE;

					costV = costs[v];
					if ( costV === undefined  || costV > costUTotal ) {
						costs[v] = costUTotal;
						open.push( v, costUTotal );
						predecessors[v] = u;
					}
				}
			}

			if ( destination !== undefined && costs[destination] === undefined ) {
				msg = ["Could not find a path from ", source, " to ", destination, "."].join( "" );
				throw new Error( msg );
			}

			destCost = costs[destination];

			while ( destination ) {
				nodes.push( destination );
				destination = predecessors[destination];
			}

			nodes.reverse();

			return { path: nodes, cost: destCost };
		},

		_findBestRoute: function ( source, destination, isMinimumTransfersMode ) {
			var i = 0, j = 0, route,
				result = { cost: 9999 },
				sources = this.getIdsByName( this.getNameById( source ) ),
				destinations = this.getIdsByName( this.getNameById( destination ) ),
				sourcesLength = sources.length,
				destinationsLength = destinations.length;

			for ( i = 0; i < sourcesLength; i++ ) {
				for ( j = 0; j < destinationsLength; j++ ) {
					route = this._calculateShortestPath( this._graph, sources[i], destinations[j], isMinimumTransfersMode );
					if ( result.cost > route.cost ) {
						result = route;
					}
				}
			}

			return result.path;
		},

		// -------------------------------------------------
		// Public

		getIdsByName: function ( name ) {
			var nameList = this._nameList, key, ret = [];

			for ( key in nameList ) {
				if( nameList[key] === name ) {
					ret.push( key );
				}
			}
			return ret;
		},

		getNameById: function ( id ) {
			return this._nameList[id];
		},

		shortestRoute: function ( source, destination ) {
			return this._findBestRoute( source, destination );
		},

		minimumTransfers: function ( source, destination ) {
			return this._findBestRoute( source, destination, true );
		},

		highlight: function ( target ) {
			var i, view, targetLength;

			if ( !this._svg || !target ) {
				return;
			}

			view = this.element;
			targetLength = target.length;

			for ( i = 0; i < targetLength; i++ ) {
				this._addClass( view.find( ".ui-id-" + target[i] ), "ui-highlight" );
			}
		},

		dishighlight: function ( target ) {
			var i, view, targetLength;

			if ( !this._svg ) {
				return;
			}

			view = this.element;
			if ( !target ) {
				this._removeClass( view.find( ".ui-station, .ui-line" ), "ui-highlight" );
				return;
			}

			targetLength = target.length;
			for ( i = 0; i < targetLength; i++ ) {
				this._removeClass( view.find( ".ui-id-" + target[i] ), "ui-highlight" );
			}
		},

		refresh: function ( redraw ) {
			var view = this.element,
				routemapContainer = view.find( "ui-routemap-container" );

			if ( routemapContainer.width() !== view.width() ) {
				routemapContainer.width( view.width() );
			}

			if ( redraw ) {
				this._clear();
				this._drawLines();
				this._drawStations();
				this._drawLegend();
				this._setupDrawingRange();
			}
		}
	} );

	$.mobile.window.on( "resize", function () {
		$( ".ui-page-active .ui-routemap" ).routemap( "refresh" );
	} );

	$.mobile.document.on( "readystatechange", function () {
		if ( document.readyState === "complete" ) {
			$( ".ui-page-active .ui-routemap" ).routemap( "refresh", true );
		}
	} );

} ( jQuery, this ) );

