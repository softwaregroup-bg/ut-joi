const ParserBase = require('./parser_base');

class JoiJsonSchemaParser extends ParserBase {
    constructor(joiObj) {
        super(joiObj, {
            childrenFieldName: 'keys',
            optionsFieldName: 'preferences',
            ruleArgFieldName: 'args',
            enumFieldName: 'allow',
            allowUnknownFlagName: 'unknown'
        });
    }

    static getVersion(joiObj) {
        return joiObj.$_root && joiObj.$_root.version;
    }

    static getSupportVersion() {
        return '16';
    }

    _getFieldDescription(fieldDefn) {
        return fieldDefn.flags && fieldDefn.flags.description;
    }

    _setNumberFieldProperties(fieldSchema, fieldDefn) {
        if (!this._isType(fieldSchema, 'number', 'integer')) {
            return;
        }

        const ruleArgFieldName = this.ruleArgFieldName;

        fieldDefn.rules && fieldDefn.rules.forEach((rule) => {
            const value = rule[ruleArgFieldName];
            switch (rule.name) {
                case 'max':
                    fieldSchema.maximum = value.limit;
                    break;
                case 'min':
                    fieldSchema.minimum = value.limit;
                    break;
                case 'greater':
                    fieldSchema.exclusiveMinimum = true;
                    fieldSchema.minimum = value.limit;
                    break;
                case 'less':
                    fieldSchema.exclusiveMaximum = true;
                    fieldSchema.maximum = value.limit;
                    break;
                case 'multiple':
                    fieldSchema.multipleOf = value.base;
                    break;
                default:
                    break;
            }
        });
    }

    _setStringFieldProperties(fieldSchema, fieldDefn) {
        if (!this._isType(fieldSchema, 'string')) {
            return;
        }

        if (fieldDefn.flags && fieldDefn.flags.encoding) {
            fieldSchema.contentEncoding = fieldDefn.flags.encoding;
        }
        fieldDefn.meta && fieldDefn.meta.forEach((m) => {
            if (m.contentMediaType) {
                fieldSchema.contentMediaType = m.contentMediaType;
            }
        });

        const ruleArgFieldName = this.ruleArgFieldName;

        fieldDefn.rules && fieldDefn.rules.forEach((rule) => {
            switch (rule.name) {
                case 'min':
                    fieldSchema.minLength = rule[ruleArgFieldName].limit;
                    break;
                case 'max':
                    fieldSchema.maxLength = rule[ruleArgFieldName].limit;
                    break;
                case 'email':
                    fieldSchema.format = 'email';
                    break;
                case 'hostname':
                    fieldSchema.format = 'hostname';
                    break;
                case 'uri':
                    fieldSchema.format = 'uri';
                    break;
                case 'ip': {
                    const versions = rule[ruleArgFieldName].options.version;
                    if (versions && versions.length) {
                        if (versions.length === 1) {
                            fieldSchema.format = versions[0];
                        } else {
                            fieldSchema.oneOf = versions.map((version) => {
                                return {
                                    format: version
                                };
                            });
                        }
                    } else {
                        fieldSchema.format = 'ipv4';
                    }
                    break;
                }
                case 'pattern': {
                    let regex = rule[ruleArgFieldName].regex;
                    let idx = regex.indexOf('/');
                    if (idx === 0) {
                        regex = regex.replace('/', '');
                    }
                    idx = regex.lastIndexOf('/') === regex.length - 1;
                    if (idx > -1) {
                        regex = regex.replace(/\/$/, '');
                    }
                    fieldSchema.pattern = regex;
                    break;
                }
                default:
                    break;
            }
        });
    }

    _setArrayFieldProperties(fieldSchema, fieldDefn) {
        if (!this._isType(fieldSchema, 'array')) {
            return;
        }

        const ruleArgFieldName = this.ruleArgFieldName;

        fieldDefn.rules && fieldDefn.rules.forEach((rule) => {
            const value = rule[ruleArgFieldName];
            switch (rule.name) {
                case 'max':
                    fieldSchema.maxItems = value.limit;
                    break;
                case 'min':
                    fieldSchema.minItems = value.limit;
                    break;
                case 'length':
                    fieldSchema.maxItems = value.limit;
                    fieldSchema.minItems = value.limit;
                    break;
                case 'unique':
                    fieldSchema.uniqueItems = true;
                    break;
                default:
                    break;
            }
        });

        if (!fieldDefn.items) {
            fieldSchema.items = {};
            return;
        }

        if (fieldDefn.items.length === 1) {
            fieldSchema.items = this._convertSchema(fieldDefn.items[0]);
        } else {
            fieldSchema.items = {
                anyOf: fieldDefn.items.map(this._convertSchema.bind(this))
            };
        }
    }

    _setDateFieldProperties(fieldSchema, fieldDefn) {
        if (!this._isType(fieldSchema, 'date')) {
            return;
        }

        if (fieldDefn.flags && fieldDefn.flags.format !== 'iso') {
            fieldSchema.type = 'integer';
        } else {
            // https://datatracker.ietf.org/doc/draft-handrews-json-schema-validation
            // JSON Schema does not have date type, but use string with format.
            // However, joi definition cannot clearly tells the date/time/date-time format
            fieldSchema.type = 'string';
            fieldSchema.format = 'date-time';
        }
    }

    _setAlternativesProperties(schema, joiDescribe) {
        if (!this._isType(schema, 'alternatives')) {
            return;
        }

        const that = this;
        schema.oneOf = joiDescribe.matches.map((match) => {
            return that._convertSchema(match.schema);
        });

        delete schema.type;
    }
}

module.exports = JoiJsonSchemaParser;
