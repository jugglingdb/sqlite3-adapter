'use strict';

module.exports = function(informationSchema) {

    const {
        castForDb
    } = informationSchema;

    return {
        buildWhere
    };

    function buildWhere(model, conds, queryParams) {
        const cs = [];
        conds = conds || {};
        Object.keys(conds).forEach(key => {
            const keyEscaped = '`' + key.replace(/\./g, '`.`') + '`';
            const val = castForDb(model, key, conds[key]);
            if (conds[key] === null) {
                cs.push(keyEscaped + ' IS NULL');
            } else if (key.toLowerCase() === 'or' && conds[key] && conds[key].constructor.name === 'Array') {
                const queries = [];
                conds[key].forEach(function(cond) {
                    queries.push(buildWhere(model, cond, queryParams));
                });
                cs.push('(' + queries.join(' OR ') + ')');
            } else if (conds[key].constructor.name === 'Object') {
                const condType = Object.keys(conds[key])[0];
                let sqlCond = keyEscaped;
                if ((condType === 'inq' || condType === 'nin') && val.length === 0) {
                    cs.push(condType === 'inq' ? 0 : 1);
                    return true;
                }
                switch (condType) {
                    case 'gt':
                        sqlCond += ' > ';
                        break;
                    case 'gte':
                        sqlCond += ' >= ';
                        break;
                    case 'ne':
                        sqlCond += ' != ';
                        break;
                    case 'lt':
                        sqlCond += ' < ';
                        break;
                    case 'lte':
                        sqlCond += ' <= ';
                        break;
                    case 'inq':
                        sqlCond += ' IN ';
                        break;
                    case 'nin':
                        sqlCond += ' NOT IN ';
                        break;
                    case 'like':
                        sqlCond += ' LIKE ';
                        break;
                    case 'nlike':
                        sqlCond += ' NOT LIKE ';
                        break;
                    case 'between':
                        sqlCond += ' BETWEEN ? AND ?';
                        queryParams.push(castForDb(model, key, conds[key][condType][0]));
                        queryParams.push(castForDb(model, key, conds[key][condType][1]));
                        break;
                }
                if (condType === 'inq' || condType === 'nin') {
                    sqlCond += '(' + val + ')';
                } else if (condType === 'like' || condType === 'nlike') {
                    sqlCond += `'${ val }'`;
                } 

                if (condType !== 'between' && condType !== 'inq' && condType !== 'nin' && condType !== 'like' && condType !== 'nlike') {
                    sqlCond += '?';
                    queryParams.push(castForDb(model, key, conds[key][condType]));
                }
                cs.push(sqlCond);
            } else {
                cs.push(keyEscaped + ' = ?');
                queryParams.push(castForDb(model, key, conds[key]));
            }
        });
        if (cs.length > 0){
            return cs.join(' AND ');
        }
        return '';
    }

};

