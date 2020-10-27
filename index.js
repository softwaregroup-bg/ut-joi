const DEFAULT_PARSER = require('./lib/parser_base');
const parsers = [
    require('./lib/parser_v16'),
    require('./lib/parser_v14')
];

function convert(joiObj) {
    let Parser;

    for (const tmpParser of parsers) {
        const version = tmpParser.getVersion(joiObj);
        if (!version) continue;
        if (parseInt(tmpParser.getSupportVersion(), 10) <= parseInt(version.split('.')[0], 10)) {
            // The first parser has smaller or equal version
            Parser = tmpParser;
            break;
        }
    }

    if (!Parser) Parser = DEFAULT_PARSER;
    return new Parser(joiObj).jsonSchema;
}

module.exports = {convert};
