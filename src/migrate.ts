import 'dotenv/config';
import {
    Api,
    AuthApi,
    CategoryApi,
    Configuration,
    PictureApi,
    RecipeApi,
    TagApi,
    UnitApi,
    UnitCategoryApi,
    UserApi,
} from './openapi';
import { LargeObjectManager } from 'pg-large-object';
import pool from './database';

let token: string;

const setToken = (t: string) => {
    token = t;
};

const getToken = () => {
    return token;
};

const config = new Configuration({
    authorization: () => getToken(),
    basePath: process.env.NEW_API_BASE_PATH
});

const authApi = new AuthApi(config);
const categoryApi = new CategoryApi(config);
const pictureApi = new PictureApi(config);
const recipeApi = new RecipeApi(config);
const tagApi = new TagApi(config);
const unitApi = new UnitApi(config);
const unitCategoryApi = new UnitCategoryApi(config);
const userApi = new UserApi(config);

const migrateUsers = async () => {
    const users = await pool.query(
        'SELECT * FROM cb_user ORDER BY username ASC'
    );
    const usersMap = new Map<number, number>();

    for (let i = 0; i < users.rows.length; i++) {
        const row = users.rows[i];
        const roles = await pool.query(
            'SELECT cb_role.* FROM cb_user_role JOIN cb_role ON cb_role.id = cb_user_role.role_id WHERE user_id=$1',
            [+row.id]
        );

        const convertedRoles: Api.CreateUser.RolesEnum[] = roles.rows
            .filter((r) => r.name === 'ROLE_EDITOR' || r.name === 'ROLE_ADMIN')
            .map((r) => {
                switch (r.name) {
                    case 'ROLE_ADMIN':
                        return Api.CreateUser.RolesEnum.ADMIN;
                    default:
                        return Api.CreateUser.RolesEnum.CREATOR;
                }
            });

        const newUser = {
            username: row.username.trim(),
            firstName:
                !row.first_name || row.first_name === ''
                    ? null
                    : row.first_name.trim(),
            lastName:
                !row.last_name || row.last_name === ''
                    ? null
                    : row.last_name.trim(),
            password: process.env.NEW_USER_PASSWORD ?? 'SecretPassword123',
            roles: [...convertedRoles],
        };
        const createdUser = await userApi.createUser(newUser);

        if ('id' in createdUser.body) {
            usersMap.set(+row.id, +createdUser.body.id);
        } else {
            console.error('NASTALA CHYBA PRI VYTVARANI USERA', newUser);
        }
    }

    return usersMap;
};

const migrateCategories = async () => {
    const categories = await pool.query('SELECT * FROM cb_category');
    const categoriesMap = new Map<number, number>();
    for (let i = 0; i < categories.rows.length; i++) {
        const row = categories.rows[i];
        const newCategory = {
            name: row.name.trim(),
        };
        const createdCategory = await categoryApi.createCategory(newCategory);
        if ('id' in createdCategory.body) {
            categoriesMap.set(+row.id, +createdCategory.body.id);
        } else {
            console.error('NASTALA CHYBA PRI VYTVARANI KATEGORIE', newCategory);
        }
    }
    return categoriesMap;
};

const migrateUnitCategories = async () => {
    const unitCategories = await pool.query('SELECT * FROM cb_unit_category');
    const unitCategoriesMap = new Map<number, number>();
    for (let i = 0; i < unitCategories.rows.length; i++) {
        const row = unitCategories.rows[i];
        const newUnitCategory = {
            name: row.name.trim(),
        };
        const createdUnitCategory = await unitCategoryApi.createUnitCategory(
            newUnitCategory
        );
        if ('id' in createdUnitCategory.body) {
            unitCategoriesMap.set(+row.id, +createdUnitCategory.body.id);
        } else {
            console.error(
                'NASTALA CHYBA PRI VYTVARANI KATEGORIE JEDNOTIEK',
                newUnitCategory
            );
        }
    }
    return unitCategoriesMap;
};

const migrateUnits = async (unitCategoriesMap: Map<number, number>) => {
    const units = await pool.query('SELECT * FROM cb_unit');
    const unitsMap = new Map<number, number>();
    for (let i = 0; i < units.rows.length; i++) {
        const row = units.rows[i];
        const newUnit = {
            abbreviation: row.abbreviation.trim(),
            name: row.name.trim(),
            unitCategoryId: unitCategoriesMap.get(+row.unit_category_id) ?? -1,
            required: row.value_required === true,
        };
        if (newUnit.unitCategoryId === -1) {
            console.error(
                'CHYBA PRI MIGROVANI, NENASLA SA NOVA KATEGORIA JEDNOTIEK',
                newUnit
            );
        }
        const createdUnit = await unitApi.createUnit(newUnit);
        if ('id' in createdUnit.body) {
            unitsMap.set(+row.id, +createdUnit.body.id);
        } else {
            console.error('NASTALA CHYBA PRI VYTVARANI JEDNOTIEK', newUnit);
        }
    }
    return unitsMap;
};

const migrateTags = async () => {
    const tags = await pool.query('SELECT * FROM cb_tag');
    const tagsMap = new Map<number, number>();
    for (let i = 0; i < tags.rows.length; i++) {
        const row = tags.rows[i];
        const newTag = {
            name: row.name.trim(),
        };
        const createdTag = await tagApi.createTag(newTag);
        if ('id' in createdTag.body) {
            tagsMap.set(+row.id, +createdTag.body.id);
        } else {
            console.error('NASTALA CHYBA PRI VYTVARANI TAGOV', newTag);
        }
    }
    return tagsMap;
};

const migrateRecipeTags = async (
    oldRecipeId: number,
    tagsMap: Map<number, number>
) => {
    const tags = await pool.query(
        'SELECT cb_recipe_tag.* FROM cb_recipe_tag WHERE cb_recipe_tag.recipe_id=$1',
        [oldRecipeId]
    );
    const migratedTags: number[] = [];
    for (let i = 0; i < tags.rows.length; i++) {
        const row = tags.rows[i];
        const newTagId = tagsMap.get(+row.tag_id);
        if (newTagId) {
            migratedTags.push(newTagId);
        }
    }
    return migratedTags;
};

const migrateRecipeSources = async (oldRecipeId: number) => {
    const sources = await pool.query(
        'SELECT cb_source.* FROM cb_source WHERE cb_source.recipe_id=$1',
        [oldRecipeId]
    );
    const migratedSources: string[] = [];
    for (let i = 0; i < sources.rows.length; i++) {
        const row = sources.rows[i];
        migratedSources.push(row.url);
    }
    return migratedSources;
};

const migrateRecipePictures = async (oldRecipeId: number) => {
    const promise = new Promise<Api.CreateRecipe.Picture[]>((resolve) => {
        pool.query('BEGIN', async function () {
            const pictures = await pool.query(
                'SELECT * FROM cb_picture WHERE cb_picture.recipe_id=$1',
                [oldRecipeId]
            );
            (async () => {
                const migratedPictures: Api.CreateRecipe.Picture[] = [];
                for (let i = 0; i < pictures.rows.length; i++) {
                    const man = new LargeObjectManager({
                        pg: pool,
                    });

                    const data = await man
                        .openAsync(
                            pictures.rows[i].data,
                            LargeObjectManager.READ
                        )
                        .then((obj) => {
                            return obj;
                        });

                    const size = await data.sizeAsync();
                    const img = await data.readAsync(size);

                    const createPicture = {
                        file: {
                            value: new Blob([img], { type: 'image/jpeg' }),
                            filename: pictures.rows[i].title,
                        },
                    };
                    const uploadedPicture = await pictureApi.uploadPicture(
                        createPicture
                    );

                    if ('id' in uploadedPicture.body) {
                        migratedPictures.push({
                            id: +uploadedPicture.body.id,
                            name: pictures.rows[i].title,
                            sortNumber: i + 1,
                        });
                    } else {
                        console.error(
                            'NASTALA CHYBA PRI VYTVARANI FOTIEK',
                            createPicture,
                            JSON.stringify(uploadedPicture)
                        );
                    }
                }
                pool.query('COMMIT');
                resolve(migratedPictures);
            })();
        });
    });

    return await promise;
};

const migrateIngredients = async (
    sectionId: number,
    unitsMap: Map<number, number>
) => {
    const ingredients = await pool.query(
        'SELECT cb_ingredient.* FROM cb_ingredient WHERE cb_ingredient.section_id=$1',
        [sectionId]
    );
    const migratedIngredients: Api.CreateRecipe.RecipeSection.Ingredient[] = [];
    for (let i = 0; i < ingredients.rows.length; i++) {
        const row = ingredients.rows[i];
        const newUnitId = unitsMap.get(+row.unit_id);
        if (newUnitId) {
            migratedIngredients.push({
                name: row.name ? row.name.trim() : null,
                value: row.value ? +row.value : null,
                sortNumber: +row.sort_number,
                unitId: newUnitId,
            });
        } else {
            console.error('Unit ID not found!', row);
        }
    }

    return migratedIngredients;
};

const migrateRecipeSections = async (
    oldRecipeId: number,
    unitsMap: Map<number, number>
) => {
    const sections = await pool.query(
        'SELECT cb_section.* FROM cb_section WHERE cb_section.recipe_id=$1',
        [oldRecipeId]
    );
    const migratedSections: Api.CreateRecipe.RecipeSection[] = [];
    for (let i = 0; i < sections.rows.length; i++) {
        const row = sections.rows[i];
        migratedSections.push({
            name: row.name ? row.name.trim() : null,
            method: row.method ? row.method.trim() : null,
            sortNumber: +row.sort_number,
            ingredients: await migrateIngredients(+row.id, unitsMap),
        });
    }
    return migratedSections;
};

const migrateRecipe = async (
    oldRecipe: any,
    depth: number,
    recipesMap: Map<number, number>,
    categoriesMap: Map<number, number>,
    unitsMap: Map<number, number>,
    tagsMap: Map<number, number>,
    usersMap: Map<number, number>
) => {
    if (depth > 10) {
        // prevent cycle
        return;
    }

    console.log('Migrujem recept', oldRecipe);

    if (recipesMap.has(+oldRecipe.id)) {
        // already migrated
        console.warn('Skipping already migrated recipe with ID', +oldRecipe.id);
        return recipesMap.get(+oldRecipe.id);
    }

    const associatedRecipes = await pool.query(
        'SELECT cb_recipe.* FROM cb_recipe_recipe JOIN cb_recipe ON cb_recipe.id = cb_recipe_recipe.associated_recipe_id WHERE recipe_id=$1',
        [+oldRecipe.id]
    );
    const newAssociatedRecipes: number[] = [];
    for (let i = 0; i < associatedRecipes.rows.length; i++) {
        const associatedRecipe = associatedRecipes.rows[i];
        const newAssociatedRecipeId = await migrateRecipe(
            associatedRecipe,
            depth + 1,
            recipesMap,
            categoriesMap,
            unitsMap,
            tagsMap,
            usersMap
        );
        if (newAssociatedRecipeId) {
            newAssociatedRecipes.push(newAssociatedRecipeId);
        }
    }

    const adminToken = getToken();

    const creator = await pool.query(
        'SELECT cb_user.* FROM cb_user WHERE cb_user.id=$1',
        [oldRecipe.creator_id]
    );

    const authenticated = await authApi.login({
        username: creator.rows[0].username,
        password: process.env.NEW_USER_PASSWORD ?? 'SecretPassword123',
    });

    if ('token' in authenticated.body) {
        setToken(authenticated.body.token);
    } else {
        console.error('NASTALA CHYBA PRIHLASOVANIA');
    }

    const newRecipe = {
        name: oldRecipe.title.trim(),
        description: oldRecipe.description.trim(),
        serves: oldRecipe.serves ? +oldRecipe.serves : null,
        method: null,
        sources: await migrateRecipeSources(+oldRecipe.id),
        tags: await migrateRecipeTags(+oldRecipe.id, tagsMap),
        categoryId: categoriesMap.get(+oldRecipe.category_id) ?? -1,
        recipeSections: await migrateRecipeSections(+oldRecipe.id, unitsMap),
        associatedRecipes: newAssociatedRecipes,
        pictures: await migrateRecipePictures(+oldRecipe.id),
    };

    if (newRecipe.categoryId === -1) {
        console.error(
            'CHYBA PRI MIGROVANI, NENASLA SA NOVA KATEGORIA',
            newRecipe
        );
    }

    const createdRecipe = await recipeApi.createRecipe(newRecipe);
    setToken(adminToken);
    if ('id' in createdRecipe.body) {
        recipesMap.set(+oldRecipe.id, +createdRecipe.body.id);
        return +createdRecipe.body.id;
    } else {
        console.error('NASTALA CHYBA PRI VYTVARANI RECEPTU', newRecipe, JSON.stringify(createdRecipe));
    }
};

const migrateRecipes = async (
    categoriesMap: Map<number, number>,
    unitsMap: Map<number, number>,
    tagsMap: Map<number, number>,
    usersMap: Map<number, number>
) => {
    const recipes = await pool.query('SELECT * FROM cb_recipe');
    const recipesMap = new Map<number, number>();

    for (let i = 0; i < recipes.rows.length; i++) {
        const row = recipes.rows[i];
        await migrateRecipe(
            row,
            1,
            recipesMap,
            categoriesMap,
            unitsMap,
            tagsMap,
            usersMap
        );
    }
};

(async () => {
    const authenticated = await authApi.login({
        username: 'Test',
        password: 'Test1234',
    });

    if ('token' in authenticated.body) {
        setToken(authenticated.body.token);
    } else {
        console.error('NASTALA CHYBA PRIHLASOVANIA');
    }

    const usersMap = await migrateUsers();
    const categoriesMap = await migrateCategories();
    const unitCategoriesMap = await migrateUnitCategories();
    const unitsMap = await migrateUnits(unitCategoriesMap);
    const tagsMap = await migrateTags();

    const recipesMap = await migrateRecipes(
        categoriesMap,
        unitsMap,
        tagsMap,
        usersMap
    );

    process.exit(0);
})();
