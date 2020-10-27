const assert = require('assert');
class JoiJsonSchemaParser {
    constructor(joiObj, {
        childrenFieldName = 'children',
        optionsFieldName = 'options',
        ruleArgFieldName = 'arg',
        enumFieldName = 'valids',
        allowUnknownFlagName = 'allowUnknown'
    } = {}) {
        if (typeof joiObj.describe !== 'function') {
            throw new Error('Not an joi object to be described.');
        }

        this.joiObj = joiObj;
        this.joiDescribe = joiObj.describe();
        this.childrenFieldName = childrenFieldName;
        this.optionsFieldName = optionsFieldName;
        this.ruleArgFieldName = ruleArgFieldName;
        this.enumFieldName = enumFieldName;
        this.allowUnknownFlagName = allowUnknownFlagName;
        this.jsonSchema = this._convertSchema(this.joiDescribe);
    }

    static getVersion(joiObj) {
        return joiObj._currentJoi && joiObj._currentJoi.version;
    }

    static getSupportVersion() {
        return '12';
    }

    _convertSchema(joiDescribe) {
        const schema = {};

        this._setBasicProperties(schema, joiDescribe);
        this._setNumberFieldProperties(schema, joiDescribe);
        this._setBinaryFieldProperties(schema, joiDescribe);
        this._setStringFieldProperties(schema, joiDescribe);
        this._setDateFieldProperties(schema, joiDescribe);
        this._setArrayFieldProperties(schema, joiDescribe);
        this._setObjectProperties(schema, joiDescribe);
        this._setAlternativesProperties(schema, joiDescribe);
        this._setAnyProperties(schema, joiDescribe);

        return schema;
    }

    _getFieldType(fieldDefn) {
        let type = fieldDefn.type;
        if (type === 'number' && fieldDefn.rules && fieldDefn.rules.length && fieldDefn.rules[0].name === 'integer') {
            type = 'integer';
        }
        const enums = fieldDefn[this.enumFieldName];
        if (Array.isArray(enums) && enums.includes(null)) {
            return [type, 'null'];
        }
        return type;
    }

    _getFieldDescription(fieldDefn) {
        return fieldDefn.description;
    }

    _getFieldExample(fieldDefn) {
        return fieldDefn.examples;
    }

    _isRequired(fieldDefn) {
        const presence = fieldDefn.flags && fieldDefn.flags.presence;
        if (presence !== undefined) {
            assert(['required', 'optional', 'forbidden'].includes(presence), presence);
            return presence === 'required';
        }
        return (fieldDefn[this.optionsFieldName] && fieldDefn[this.optionsFieldName].presence) === 'required';
    }

    _getDefaultValue(fieldDefn) {
        return fieldDefn.flags && fieldDefn.flags.default;
    }

    _getEnum(fieldDefn) {
        if (!fieldDefn[this.enumFieldName] || !fieldDefn[this.enumFieldName].length) {
            return undefined;
        }

        const enumList = fieldDefn[this.enumFieldName].filter(item => item != null);
        return !enumList.length ? undefined : enumList;
    }

    _setIfNotEmpty(schema, field, value) {
        if (value !== null && value !== undefined) {
            schema[field] = value;
        }
    }

    _setBasicProperties(fieldSchema, fieldDefn) {
        this._setIfNotEmpty(fieldSchema, 'type', this._getFieldType(fieldDefn));
        this._setIfNotEmpty(fieldSchema, 'examples', this._getFieldExample(fieldDefn));
        this._setIfNotEmpty(fieldSchema, 'description', this._getFieldDescription(fieldDefn));
        this._setIfNotEmpty(fieldSchema, 'default', this._getDefaultValue(fieldDefn));
        this._setIfNotEmpty(fieldSchema, 'enum', this._getEnum(fieldDefn));
    }

    _isType(schema, ...types) {
        return schema && schema.type && [].concat(schema.type).some(item => types.includes(item));
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
                    fieldSchema.maximum = value;
                    break;
                case 'min':
                    fieldSchema.minimum = value;
                    break;
                case 'greater':
                    fieldSchema.exclusiveMinimum = true;
                    fieldSchema.minimum = value;
                    break;
                case 'less':
                    fieldSchema.exclusiveMaximum = true;
                    fieldSchema.maximum = value;
                    break;
                case 'multiple':
                    fieldSchema.multipleOf = value;
                    break;
                default:
                    break;
            }
        });
    }

    _setBinaryFieldProperties(fieldSchema, fieldDefn) {
        if (!this._isType(fieldSchema, 'binary')) {
            return;
        }
        fieldSchema.type = 'string';
        if (fieldDefn.flags && fieldDefn.flags.encoding) {
            fieldSchema.contentEncoding = fieldDefn.flags.encoding;
        }
        fieldSchema.format = 'binary';
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
                    fieldSchema.minLength = rule[ruleArgFieldName];
                    break;
                case 'max':
                    fieldSchema.maxLength = rule[ruleArgFieldName];
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
                    const versions = rule[ruleArgFieldName].version;
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
                case 'regex':
                    fieldSchema.pattern = rule[ruleArgFieldName].pattern.source;
                    break;
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
                    fieldSchema.maxItems = value;
                    break;
                case 'min':
                    fieldSchema.minItems = value;
                    break;
                case 'length':
                    fieldSchema.maxItems = value;
                    fieldSchema.minItems = value;
                    break;
                case 'unique':
                    fieldSchema.uniqueItems = true;
                    break;
                default:
                    break;
            }
        });

        if (!fieldDefn.items) {
            // fieldSchema.items = {};
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

        if (fieldDefn.flags && fieldDefn.flags.timestamp) {
            fieldSchema.type = 'integer';
        } else {
            // https://datatracker.ietf.org/doc/draft-handrews-json-schema-validation
            // JSON Schema does not have date type, but use string with format.
            // However, joi definition cannot clearly tells the date/time/date-time format
            fieldSchema.type = 'string';
            fieldSchema.format = 'date-time';
        }
    }

    _setObjectProperties(schema, joiDescribe) {
        if (!this._isType(schema, 'object')) {
            return;
        }

        schema.properties = {};
        schema.required = [];

        schema.additionalProperties = (joiDescribe[this.optionsFieldName] && joiDescribe[this.optionsFieldName].allowUnknown) || !joiDescribe[this.childrenFieldName] || false;
        if (joiDescribe.flags && typeof joiDescribe.flags[this.allowUnknownFlagName] !== 'undefined') {
            schema.additionalProperties = joiDescribe.flags[this.allowUnknownFlagName];
        }

        const that = this;
        joiDescribe[this.childrenFieldName] && Object.entries(joiDescribe[this.childrenFieldName]).forEach(([key, fieldDefn]) => {
            const fieldSchema = that._convertSchema(fieldDefn);
            if (that._isRequired(fieldDefn)) {
                schema.required.push(key);
            }

            schema.properties[key] = fieldSchema;
        });
        if (!schema.required.length) {
            delete schema.required;
        }
    }

    _setAlternativesProperties(schema, joiDescribe) {
        if (!this._isType(schema, 'alternatives')) {
            return;
        }

        schema.oneOf = joiDescribe.alternatives.map(this._convertSchema.bind(this));
        delete schema.type;
    }

    _setAnyProperties(schema) {
        if (!this._isType(schema, 'any')) {
            return;
        }

        schema.type = [
            'array',
            'boolean',
            'number',
            'object',
            'string',
            'null'
        ];
    }
}

module.exports = JoiJsonSchemaParser;
